/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * HR-HOSPITALITY — Motor de Sincronização (sync_queue -> Supabase)
 *
 * AUDITORIA/CORREÇÃO: anteriormente a fila `sync_queue` era gravada pelo
 * dataLayer em modo offline, mas NUNCA era consumida — os eventos ficavam
 * presos no SQLite local para sempre.
 *
 * Este módulo implementa a reconciliação:
 *  1. Lê os eventos pendentes da fila (por ordem de timestamp).
 *  2. Cola (coalesce) eventos repetidos do mesmo registo — aplica apenas
 *     o estado final, preservando a última operação (ex.: UPDATE após INSERT).
 *  3. Reproduz cada operação no Supabase (upsert/delete).
 *  4. Em caso de sucesso: apaga o evento da fila e marca a linha local
 *     como `sync_status = 'synced'`.
 *  5. Em caso de falha: interrompe (preserva a ordem) e tenta novamente
 *     no próximo ciclo — nenhuma perda de dados.
 *
 * Dispara automaticamente: ao voltar a conexão (evento `online`),
 * periodicamente (a cada 60s) e após escritas locais no dataLayer.
 */

import { supabaseClient } from './supabaseClient';
import { localQuery, localExecute, checkServerHealth } from './db/localDB';

export interface SyncEvent {
    id: string;
    table_name: string;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    record_id: string;
    data: string | null;
    timestamp: number;
    attempts?: number;
}

export interface SyncStats {
    pending: number;
    failed: number;
    byTable: Record<string, number>;
    oldestEvent: number | null;
    lastFlushAt: number | null;
    lastFlushResult: 'success' | 'partial' | 'error' | 'offline' | null;
    lastFlushSynced: number;
    lastFlushFailed: number;
    lastError: string | null;
}

let isFlushing = false;
let lastFlushAt: number | null = null;
let lastFlushResult: SyncStats['lastFlushResult'] = null;
let lastFlushSynced = 0;
let lastFlushFailed = 0;
let lastError: string | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

const MAX_ATTEMPTS_PER_CYCLE = 50;

// ---------------------------------------------------------------------------
// Estatísticas de integridade
// ---------------------------------------------------------------------------

export async function getSyncStats(): Promise<SyncStats> {
    let pending = 0;
    let failed = 0;
    let oldestEvent: number | null = null;
    const byTable: Record<string, number> = {};

    try {
        const healthy = await checkServerHealth();
        if (!healthy) {
            return {
                pending: 0, failed: 0, byTable: {}, oldestEvent: null,
                lastFlushAt, lastFlushResult: 'offline', lastFlushSynced, lastFlushFailed, lastError,
            };
        }

        const rows = await localQuery(
            `SELECT table_name, COUNT(*) as count, MIN(timestamp) as oldest
             FROM sync_queue GROUP BY table_name`
        );
        for (const row of rows || []) {
            byTable[row.table_name] = Number(row.count);
            pending += Number(row.count);
            if (oldestEvent === null || row.oldest < oldestEvent) oldestEvent = row.oldest;
        }

        // Registros locais presos em 'pending' sem evento correspondente na fila
        // (possível depois de a fila ser limpa manualmente) são contabilizados como falha latente.
        const queueTables = Object.keys(byTable);
        for (const table of queueTables) {
            try {
                const queueIds = await localQuery(`SELECT DISTINCT record_id FROM sync_queue WHERE table_name = ?`, [table]);
                const placeholders = queueIds.map(() => '?').join(',');
                const orphan = await localQuery(
                    `SELECT COUNT(*) as count FROM ${table}
                     WHERE sync_status = 'pending'
                     ${queueIds.length ? `AND id NOT IN (${placeholders})` : ''}`,
                    queueIds.map((q: any) => q.record_id)
                );
                failed += Number(orphan?.[0]?.count || 0);
            } catch { /* tabela pode não ter coluna sync_status */ }
        }
    } catch (e: any) {
        lastError = e?.message || String(e);
    }

    return {
        pending,
        failed,
        byTable,
        oldestEvent,
        lastFlushAt,
        lastFlushResult,
        lastFlushSynced,
        lastFlushFailed,
        lastError,
    };
}

// ---------------------------------------------------------------------------
// Reconciliação (flush)
// ---------------------------------------------------------------------------

/**
 * Reduz a fila ao último estado conhecido de cada registo.
 * Ex.: INSERT(x) -> UPDATE(x) -> UPDATE(x) vira um único UPDATE final.
 * A ordem relativa entre registos diferentes é preservada.
 */
function coalesceEvents(events: SyncEvent[]): SyncEvent[] {
    const lastIndex = new Map<string, number>();
    events.forEach((ev, idx) => {
        lastIndex.set(`${ev.table_name}::${ev.record_id}`, idx);
    });
    return events.filter((_, idx) => lastIndex.get(`${events[idx].table_name}::${events[idx].record_id}`) === idx);
}

async function applyEventToSupabase(ev: SyncEvent): Promise<{ ok: boolean; error?: string }> {
    if (!supabaseClient) return { ok: false, error: 'Supabase client não inicializado' };

    try {
        if (ev.action === 'DELETE') {
            const { error } = await supabaseClient.from(ev.table_name).delete().eq('id', ev.record_id);
            return error ? { ok: false, error: error.message } : { ok: true };
        }

        // INSERT ou UPDATE -> upsert do estado final (idempotente)
        const payload = ev.data ? JSON.parse(ev.data) : null;
        if (!payload) return { ok: false, error: 'Evento sem payload (data)' };

        // Nunca enviar metadados internos de fila para a nuvem
        delete payload.sync_status;

        const { error } = await supabaseClient
            .from(ev.table_name)
            .upsert(payload, { onConflict: 'id' });
        return error ? { ok: false, error: error.message } : { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message || String(e) };
    }
}

export async function flushSyncQueue(): Promise<SyncStats> {
    if (isFlushing) return getSyncStats();
    isFlushing = true;
    lastFlushSynced = 0;
    lastFlushFailed = 0;
    lastError = null;

    try {
        // Só faz sentido sincronizar com servidor local acessível e Supabase disponível
        const [localHealthy] = await Promise.all([checkServerHealth()]);
        if (!localHealthy) {
            lastFlushResult = 'offline';
            return await getSyncStats();
        }

        const events: SyncEvent[] = await localQuery(
            `SELECT id, table_name, action, record_id, data, timestamp
             FROM sync_queue ORDER BY timestamp ASC`
        );

        if (!events || events.length === 0) {
            lastFlushResult = 'success';
            lastFlushAt = Date.now();
            return await getSyncStats();
        }

        // Cola eventos do mesmo registo — o estado final é o que interessa
        const coalesced = coalesceEvents(events);

        // Marca eventos colados (substituídos) como resolvidos imediatamente:
        // o seu efeito já está contido no payload do evento final.
        const finalIds = new Set(coalesced.map(e => e.id));
        const superseded = events.filter(e => !finalIds.has(e.id)).map(e => e.id);
        if (superseded.length > 0) {
            const ph = superseded.map(() => '?').join(',');
            await localExecute(`DELETE FROM sync_queue WHERE id IN (${ph})`, superseded);
            console.warn(`[HOSPITALITY/Sync] ${superseded.length} eventos colapsados em ${coalesced.length} operações finais.`);
        }

        for (const ev of coalesced.slice(0, MAX_ATTEMPTS_PER_CYCLE)) {
            const result = await applyEventToSupabase(ev);

            if (result.ok) {
                // 1. Remover evento da fila
                await localExecute(`DELETE FROM sync_queue WHERE id = ?`, [ev.id]);

                // 2. Marcar linha local como sincronizada (exceto deletes — a linha já não existe)
                if (ev.action !== 'DELETE') {
                    await localExecute(
                        `UPDATE ${ev.table_name} SET sync_status = 'synced' WHERE id = ?`,
                        [ev.record_id]
                    );
                }
                lastFlushSynced++;
            } else {
                lastError = `${ev.table_name}/${ev.action}/${ev.record_id}: ${result.error}`;
                lastFlushFailed++;
                // Interromper para preservar a ordem dos eventos — retry no próximo ciclo
                break;
            }
        }

        const remaining = await localQuery(`SELECT COUNT(*) as count FROM sync_queue`);
        const remainingCount = Number(remaining?.[0]?.count || 0);
        lastFlushResult = remainingCount === 0 ? 'success' : (lastFlushSynced > 0 ? 'partial' : 'error');
        lastFlushAt = Date.now();

        console.log(
            `[HOSPITALITY/Sync] Flush concluído: ${lastFlushSynced} sincronizados, ` +
            `${remainingCount} pendentes, resultado: ${lastFlushResult}` +
            (lastError ? ` | último erro: ${lastError}` : '')
        );

        return await getSyncStats();
    } catch (e: any) {
        lastFlushResult = 'error';
        lastError = e?.message || String(e);
        lastFlushAt = Date.now();
        console.error('[HOSPITALITY/Sync] Erro fatal no flush:', e);
        return await getSyncStats();
    } finally {
        isFlushing = false;
    }
}

// ---------------------------------------------------------------------------
// Agendamento automático
// ---------------------------------------------------------------------------

/** Agenda o flush automático: na reconexão, periodicamente e sob demanda. */
export function startAutoSync(intervalMs: number = 60_000): void {
    if (typeof window === 'undefined') return; // apenas no browser
    if (flushTimer) return; // já iniciado

    const triggerIfPossible = () => {
        // Só tenta flush se há de fato eventos pendentes
        (async () => {
            try {
                const stats = await getSyncStats();
                if (stats.pending > 0 && supabaseClient && navigator.onLine) {
                    flushSyncQueue();
                }
            } catch { /* silencioso */ }
        })();
    };

    window.addEventListener('online', () => {
        console.log('[HOSPITALITY/Sync] Conexão restabelecida — reconciliação agendada.');
        // Pequeno atraso para estabilizar a rede
        setTimeout(triggerIfPossible, 3_000);
    });

    flushTimer = setInterval(triggerIfPossible, intervalMs);

    // Primeira tentativa ao carregar a app
    setTimeout(triggerIfPossible, 5_000);

    console.log(`[HOSPITALITY/Sync] Motor de sincronização iniciado (intervalo: ${intervalMs / 1000}s).`);
}

/** Chamado pelo dataLayer após cada escrita local em modo offline. */
export function scheduleFlushAfterWrite(): void {
    if (typeof window === 'undefined') return;
    setTimeout(() => {
        if (supabaseClient && navigator.onLine) flushSyncQueue();
    }, 1_000);
}
