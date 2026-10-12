/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * HR-HOSPITALITY — Sincronização Inbound (Supabase Cloud → SQLite Local)
 *
 * CAUSA-RAIZ CORRIGIDA AQUI
 * -------------------------
 * A arquitetura é Local-First: `hotel_reservations` pertence a
 * `LOCAL_AUTHORITATIVE_TABLES`, logo `dataLayer.canTryCloud()` devolve `false`
 * e a app local **nunca** lê reservas da nuvem. O `syncEngine` apenas faz
 * *push* (local → cloud). Consequência: uma reserva criada na Landing Page
 * (Vercel → Supabase) ficava presa na nuvem e **nunca** aparecia na Central de
 * Reservas do Servidor Local. Não existia qualquer caminho cloud → local.
 *
 * ESTE MÓDULO É O CAMINHO QUE FALTAVA:
 *   1. Lê `hotel_reservations` no Supabase com a sessão **autenticada**
 *      (RLS `reservations_select_lodging`; o `anon` só tem INSERT e devolve
 *      42501 `permission denied` — verificado empiricamente).
 *   2. Mapeia as colunas cloud → spec local (`RESOURCE_SPECS`), incluindo
 *      `service_type` (7 valores aceites na cloud vs 4 no CHECK do SQLite).
 *   3. Grava via `data.cache.upsert` (`queue:false`, `status:'synced'`) —
 *      injeta no SQLite **sem** re-enfileirar para a nuvem (evita loop).
 *   4. Só sobrescreve um registo local quando a cloud é mais nova
 *      (compara `updated_at`), para não clobberar um check-in local feito
 *      entretanto.
 *
 * Dispara em três alturas:
 *   • arranque da sessão (`startCloudInboundSync` chamado pelo AuthContext);
 *   • Realtime `postgres_changes` na tabela `hotel_reservations`;
 *   • polling de segurança a cada 12s.
 *
 * Toda a actividade é logada com o prefixo `[InboundSync]` para diagnóstico no
 * DevTools do Servidor (Secção 1 do plano).
 */

import { isSupabaseConfigured, supabaseClient } from './supabaseClient';
import { localOperation, localQuery } from './db/localDB';
import { emitRoomEvent } from './roomEvents';

const TAG = '[InboundSync]';

/** Máximo de linhas lidas da nuvem por ciclo. */
const PULL_LIMIT = 500;
/** Polling de contingência (10–15s pedido no plano → 12s). */
const POLL_INTERVAL_MS = 12_000;
/** `data.select` aceita no máximo 100 valores por filtro `in`. */
const ID_CHUNK = 100;
/** `data.cache.upsert` aceita no máximo 100 linhas por chamada. */
const WRITE_CHUNK = 100;

/** Tipos de serviço aceites pelo CHECK do SQLite local. */
const LOCAL_SERVICE_TYPES = new Set(['quarto', 'conferencia', 'restaurante', 'transfer']);
/** Estados aceites pelo CHECK do SQLite local. */
const LOCAL_STATUSES = new Set([
  'PENDENTE_PAGAMENTO', 'CONFIRMADA', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELADA'
]);
/** `assertBusinessId` do servidor exige um UUID canónico. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CloudPullSummary {
  ok: boolean;
  reason: string;
  /** Linhas devolvidas pelo Supabase. */
  fetched: number;
  /** Registos novos gravados no SQLite local. */
  inserted: number;
  /** Registos locais atualizados pela nuvem. */
  updated: number;
  /** Linhas descartadas ou já atualizadas. */
  skipped: number;
  durationMs: number;
  error?: string;
}

type CloudRow = Record<string, any>;

interface MappedEntry {
  raw: CloudRow;
  row: Record<string, unknown>;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(...args: unknown[]): void {
  console.log(TAG, ...args);
}

function warn(...args: unknown[]): void {
  console.warn(TAG, ...args);
}

function error(...args: unknown[]): void {
  console.error(TAG, ...args);
}

/** Normaliza um valor escrito pelo PostgREST para string ou `null`. */
function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/**
 * Desembrulha a resposta de `localOperation`/`localQuery`.
 * O modo Servidor devolve `{ data: [...] }`; o modo Cliente (HTTP) envolve
 * uma vez mais em `{ ok: true, data: { data: [...] } }`.
 */
function unwrapRows<T>(result: any): T[] {
  if (!result || typeof result !== 'object') return [];
  if ('ok' in result && 'data' in result) return unwrapRows(result.data);
  return Array.isArray(result.data) ? (result.data as T[]) : [];
}

// ---------------------------------------------------------------------------
// Mapeamento cloud → local
// ---------------------------------------------------------------------------

/**
 * Converte uma linha do Supabase num registo aceite por `RESOURCE_SPECS`.
 * Devolve `null` quando o `id` não é um UUID canónico (caso teórico: a cloud
 * usa `gen_random_uuid()`, portanto na prática nunca acontece).
 */
function mapCloudRow(raw: CloudRow): MappedEntry | null {
  const warnings: string[] = [];

  const id = asText(raw.id);
  if (!id || !UUID_RE.test(id)) {
    warn('linha descartada — id não é UUID canónico:', id ?? raw);
    return null;
  }

  const row: Record<string, unknown> = {
    id: id.toLowerCase(),
    guest_name: asText(raw.guest_name) ?? '',
    email: asText(raw.email) ?? ''
  };

  // A Landing Page pode escrever 7 tipos de serviço (migração 006/009) mas o
  // SQLite local só aceita 4 — sem mapeamento o INSERT falhava com CHECK.
  const rawService = (asText(raw.service_type) ?? 'quarto').toLowerCase();
  let serviceType = rawService;
  if (!LOCAL_SERVICE_TYPES.has(serviceType)) {
    serviceType = rawService === 'evento' ? 'conferencia' : 'quarto';
    warnings.push(`service_type "${rawService}" → "${serviceType}"`);
  }
  row.service_type = serviceType;

  const rawStatus = (asText(raw.status) ?? 'PENDENTE_PAGAMENTO').toUpperCase();
  let status = rawStatus;
  if (!LOCAL_STATUSES.has(status)) {
    status = 'PENDENTE_PAGAMENTO';
    warnings.push(`status "${rawStatus}" → "${status}"`);
  }
  row.status = status;

  // Campos opcionais — omitidos quando vazios (o servidor rejeita `undefined`).
  // Inclui o registo universal (migração 017): sem estes quatro caminhos a
  // receção não vê o documento, o comprovativo nem a cara do hóspede.
  const optional = {
    room_number: asText(raw.room_number),
    room_id: asText(raw.room_id),
    check_in_date: asText(raw.check_in_date),
    check_out_date: asText(raw.check_out_date),
    reservation_date: asText(raw.reservation_date),
    guest_phone: asText(raw.guest_phone),
    document_type: asText(raw.document_type),
    document_number: asText(raw.document_number),
    document_path: asText(raw.document_path),
    receipt_path: asText(raw.receipt_path),
    face_path: asText(raw.face_path),
    created_at: asText(raw.created_at)
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== null) row[key] = value;
  }

  // `document_type` tem CHECK ('BI','PASSAPORTE') também no SQLite. Sem
  // normalizar, uma diferença de maiúsculas da nuvem rejeitaria a linha
  // inteira no cache — e a reserva nunca chegava à receção.
  if (typeof row.document_type === 'string') {
    const rawDocType = row.document_type.trim().toUpperCase();
    if (rawDocType === 'BI' || rawDocType === 'PASSAPORTE') {
      row.document_type = rawDocType;
    } else {
      delete row.document_type;
      delete row.document_number; // tipo e número são inseparáveis (CHECK)
      warnings.push(`document_type "${rawDocType}" descartado`);
    }
  }

  const amount = Number(raw.total_amount ?? 0);
  row.total_amount = Number.isFinite(amount) && amount >= 0 ? amount : 0;

  let notes = asText(raw.notes);
  if (warnings.length) {
    // Preserva a informação original na cloud quando houve remapeamento.
    const tag = `[vindo da web: ${warnings.join('; ')}]`;
    notes = notes ? `${notes} ${tag}` : tag;
  }
  if (notes !== null) row.notes = notes;

  return { raw, row, warnings };
}

// ---------------------------------------------------------------------------
// Pull (cloud → local)
// ---------------------------------------------------------------------------

/**
 * Puxa as reservas do Supabase e injeta-as no SQLite local.
 *
 * @param reason motivo do pull (`startup`, `realtime`, `poll`, `manual`).
 */
export async function pullCloudReservations(reason = 'manual'): Promise<CloudPullSummary> {
  const started = Date.now();
  const summary: CloudPullSummary = {
    ok: false,
    reason,
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    durationMs: 0
  };

  log(`▶ pull iniciado (motivo="${reason}")`);

  if (!isSupabaseConfigured || !supabaseClient) {
    summary.error = 'Supabase não configurado — verifique NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no build.';
    error('✗', summary.error);
    summary.durationMs = Date.now() - started;
    return summary;
  }

  try {
    // 1. Sessão — a RLS só devolve linhas a um `authenticated` com o módulo
    //    de alojamento. Sem sessão o PostgREST responde 401/42501.
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (sessionError) {
      error('✗ erro ao obter a sessão Supabase:', sessionError.message);
    }
    log(accessToken
      ? 'sessão autenticada OK (RLS: reservations_select_lodging)'
      : '⚠ SEM SESSÃO — a nuvem vai responder 401/42501 (anon não tem SELECT)');

    // 2. Leitura direta ao Supabase (bypassa `canTryCloud`, que bloqueia
    //    `hotel_reservations` por ser tabela local-authoritative).
    const { data, error: selectError } = await supabaseClient
      .from('hotel_reservations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PULL_LIMIT);

    if (selectError) {
      summary.error = `${selectError.code || 'REST'}: ${selectError.message}`;
      error('✗ SELECT falhou na nuvem:', summary.error);
      if (String(selectError.code) === '42501' || /permission denied/i.test(selectError.message)) {
        error('  → RLS nega a leitura. Confirme que a sessão é `authenticated` e que o',
          'perfil tem o módulo `alojamento` (policy reservations_select_lodging).');
      }
      summary.durationMs = Date.now() - started;
      return summary;
    }

    const cloudRows = (data || []) as CloudRow[];
    summary.fetched = cloudRows.length;
    log(`nuvem devolveu ${cloudRows.length} registo(s)`);

    if (cloudRows.length === 0) {
      summary.ok = true;
      summary.durationMs = Date.now() - started;
      log(`✓ pull sem alterações em ${summary.durationMs}ms`);
      return summary;
    }

    // 3. Mapeamento para a spec local.
    const mapped: MappedEntry[] = [];
    for (const raw of cloudRows) {
      const entry = mapCloudRow(raw);
      if (!entry) {
        summary.skipped++;
        continue;
      }
      if (entry.warnings.length) {
        warn(`mapeamento de ${entry.row.id}:`, entry.warnings.join(' | '));
      }
      mapped.push(entry);
    }
    if (mapped.length === 0) {
      summary.ok = true;
      summary.durationMs = Date.now() - started;
      return summary;
    }

    // 4. Descobre o que já existe localmente (para não clobberar dados novos).
    const localUpdatedAt = new Map<string, string | null>();
    const ids = mapped.map(entry => String(entry.row.id));
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const chunk = ids.slice(i, i + ID_CHUNK);
      const localRows = await localQuery<Array<{ id: string; updated_at?: string | null }>>(
        'data.select',
        {
          resource: 'hotel_reservations',
          columns: ['id', 'updated_at'],
          filters: [{ column: 'id', op: 'in', value: chunk }],
          limit: ID_CHUNK
        }
      );
      for (const localRow of localRows || []) {
        localUpdatedAt.set(localRow.id, localRow.updated_at ?? null);
      }
    }
    log(`local: ${localUpdatedAt.size}/${ids.length} registo(s) já existem`);

    // 5. Separa novos / obsoletos / ignorados.
    const toInsert: MappedEntry[] = [];
    const toUpdate: MappedEntry[] = [];
    for (const entry of mapped) {
      const id = String(entry.row.id);
      if (!localUpdatedAt.has(id)) {
        toInsert.push(entry);
        continue;
      }
      const cloudTs = Date.parse(String(entry.raw.updated_at ?? entry.raw.created_at ?? ''));
      const localTsRaw = localUpdatedAt.get(id);
      const localTs = localTsRaw ? Date.parse(localTsRaw) : NaN;
      if (Number.isFinite(cloudTs) && Number.isFinite(localTs) && cloudTs > localTs) {
        toUpdate.push(entry);
      } else {
        // Local é igual ou mais novo → nada a fazer.
        summary.skipped++;
      }
    }
    log(`a ingirir → ${toInsert.length} nova(s), ${toUpdate.length} atualizada(s), ${summary.skipped} ignorada(s)`);

    // 6. Escrita no SQLite local SEM enfileirar para a nuvem
    //    (`data.cache.upsert` ⇒ queue:false, sync_status:'synced').
    const ingest = async (batch: MappedEntry[], label: string) => {
      for (let i = 0; i < batch.length; i += WRITE_CHUNK) {
        const slice = batch.slice(i, i + WRITE_CHUNK);
        try {
          const result = await localOperation('data.cache.upsert', {
            resource: 'hotel_reservations',
            rows: slice.map(entry => entry.row)
          });
          const written = unwrapRows(result);
          log(`  ✓ ${label}: ${written.length}/${slice.length} registo(s) gravados no SQLite local`);
        } catch (err) {
          error(`  ✗ ${label} falhou:`, err instanceof Error ? err.message : err);
          summary.error = err instanceof Error ? err.message : String(err);
        }
      }
    };

    if (toInsert.length) await ingest(toInsert, 'INSERT');
    if (toUpdate.length) await ingest(toUpdate, 'UPDATE');
    summary.inserted = toInsert.length;
    summary.updated = toUpdate.length;

    // 7. Notifica o barramento local para o Dashboard / Central de Reservas /
    //    Mapa de Quartos reactualizarem sem recarregar a página.
    const changed = [...toInsert, ...toUpdate];
    if (changed.length > 0) {
      for (const entry of changed.slice(0, 20)) {
        emitRoomEvent({
          type: 'reservation',
          reservationId: String(entry.row.id),
          ...(entry.row.room_id ? { roomId: String(entry.row.room_id) } : {}),
          ...(entry.row.room_number ? { roomNumber: String(entry.row.room_number) } : {})
        });
      }
      log(`✓ UI notificada por ${Math.min(changed.length, 20)} evento(s) de sala`);
    }

    summary.ok = !summary.error;
    summary.durationMs = Date.now() - started;
    log(`✓ pull concluído em ${summary.durationMs}ms → ${summary.inserted} nova(s), ${summary.updated} atualizada(s), ${summary.skipped} ignorada(s)`);
    return summary;
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
    summary.durationMs = Date.now() - started;
    error('✗ exceção durante o pull:', summary.error, err);
    return summary;
  }
}

// ---------------------------------------------------------------------------
// Arranque: Realtime + polling + pull inicial
// ---------------------------------------------------------------------------

let started = false;
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let channel: any = null;

/** Subscrição Realtime com logs detalhados de cada etapa (Secção 1). */
function subscribeRealtime(): void {
  if (!supabaseClient) return;

  try {
    channel = supabaseClient
      .channel('hr_inbound_reservations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hotel_reservations' },
        (payload: any) => {
          log(`postgres_changes recebido (eventType=${payload?.eventType}) id=${payload?.new?.id ?? payload?.old?.id ?? '?'}`);
          void pullCloudReservations('realtime');
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (status === 'SUBSCRIBED') {
          log('Realtime SUBSCRIBED — a escuta de `hotel_reservations` ativa');
        } else if (status === 'CHANNEL_ERROR') {
          error('Realtime CHANNEL_ERROR:', err?.message ?? 'erro desconhecido',
            '→ o polling de 12s continua a garantir a recuperação');
        } else if (status === 'TIMED_OUT') {
          error('Realtime TIMED_OUT:', err?.message ?? 'sem resposta do Realtime',
            '→ o polling de 12s continua a garantir a recuperação');
        } else if (status === 'CLOSED') {
          warn('Realtime CLOSED — canal fechado');
        } else {
          log('Realtime status:', status);
        }
      });
  } catch (err) {
    error('falha ao subscrever o canal Realtime:', err instanceof Error ? err.message : err);
  }
}

/**
 * Liga a sincronização inbound. Idempotente — pode ser chamada em cada
 * renovação de sessão sem duplicar canais nem timers.
 */
export function startCloudInboundSync(): void {
  if (started) {
    log('já ativa — pull imediato ignorado (manter o ciclo de 12s)');
    return;
  }
  if (!isSupabaseConfigured || !supabaseClient) {
    warn('Supabase não configurado — sincronização inbound desativada');
    return;
  }
  started = true;
  log('arranque da sincronização inbound (Realtime + polling ' + POLL_INTERVAL_MS + 'ms)');

  // O AuthContext chama esta função no mesmo tick do `establishSession`; o
  // token pode ainda não estar no storage, por isso tentamos já e, se falhar,
  // o polling seguinte segue.
  void pullCloudReservations('startup');

  subscribeRealtime();

  pollingTimer = setInterval(() => {
    void pullCloudReservations('poll');
  }, POLL_INTERVAL_MS);
}

/** Para os timers/canal (usado em testes ou em logout). */
export function stopCloudInboundSync(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  if (channel && supabaseClient) {
    try { void supabaseClient.removeChannel(channel); } catch { /* já removido */ }
    channel = null;
  }
  started = false;
  log('sincronização inbound parada');
}
