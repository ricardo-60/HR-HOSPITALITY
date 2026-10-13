/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * HR-HOSPITALITY — Sincronização de Preços/Catálogo (Supabase Cloud → SQLite Local)
 *
 * CONTEXTO ARQUITECTURAL
 * ----------------------
 * `hotel_rooms` é local-authoritative no ESTADO (DISPONIVEL/RESERVADO/OCUPADO/
 * LIMPEZA/MANUTENCAO vivem no SQLite da recepção e o `syncEngine` espelha-os
 * para a nuvem). Porém NÃO existe editor local de `price_per_night`: os preços
 * são alterados na base de dados Supabase (painel do hotel / SQL) e têm de
 * chegar ao RoomBoard, ao OccupancyPanel e ao checkout em segundos.
 *
 * ESTE MÓDULO É O CAMINHO CLOUD → LOCAL PARA CATÁLOGO:
 *   1. subscreve `postgres_changes` em `hotel_rooms` e `room_rates` na nuvem;
 *   2. relemos APENAS as colunas de catálogo das linhas alteradas
 *      (`price_per_night`, `room_type`, `floor`, `description`) — o `status`
 *      nunca é tocado, preservando a autoridade local do estado;
 *   3. gravamos via `localOperation('hotel_rooms.update', …)` (sem re-enfileirar
 *      para a nuvem: são só colunas de catálogo, o mirror continua a mandar o
 *      que é local-authoritative);
 *   4. emitimos no barramento `roomEvents` para o RoomBoard/OccupancyPanel/
 *      Dashboard reagirem sem polling adicional.
 *
 * Recuperação: polling de segurança a cada 60 s (comparação barata de catálogo)
 * e re-subscrição da canal se esta fechar.
 */

import { localOperation, localQuery } from './db/localDB';
import { emitRoomEvent } from './roomEvents';
import { isSupabaseConfigured, supabaseClient } from './supabaseClient';

const TAG = '[PricingSync]';
/** Polling de contingência — catálogo pequeno (dezenas de linhas). */
const POLL_INTERVAL_MS = 60_000;
/** Junta eventos consecutivos numa só leitura. */
const DEBOUNCE_MS = 600;

/** Colunas de catálogo sincronizadas da nuvem. O `status` NUNCA entra aqui. */
const PRICING_COLUMNS = 'id, room_number, room_type, price_per_night, floor, description';

interface RoomPricingRow {
  id: string;
  room_number: string;
  room_type: string;
  price_per_night: number;
  floor: string | number | null;
  description: string | null;
}

let started = false;
let channel: any = null;
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const pendingIds = new Set<string>();

function log(...args: any[]): void {
  console.log(TAG, ...args);
}

function warn(...args: any[]): void {
  console.warn(TAG, ...args);
}

/** Grava as colunas de catálogo no SQLite local e notifica a UI. */
async function applyPricingRows(rows: RoomPricingRow[]): Promise<void> {
  for (const row of rows) {
    if (!row?.id) continue;
    try {
      await localOperation('hotel_rooms.update', {
        id: row.id,
        room_type: row.room_type,
        price_per_night: row.price_per_night,
        floor: row.floor,
        description: row.description,
      });
      emitRoomEvent({
        type: 'room-status',
        roomId: row.id,
        roomNumber: row.room_number ? String(row.room_number) : undefined,
      });
    } catch (err) {
      warn('falha ao aplicar catálogo do quarto', row.id, err);
    }
  }
}

/** Lê da nuvem o catálogo dos ids alterados e aplica-o localmente. */
async function flushPending(): Promise<void> {
  if (!supabaseClient || pendingIds.size === 0) return;
  const ids = Array.from(pendingIds);
  pendingIds.clear();
  try {
    const { data, error } = await supabaseClient
      .from('hotel_rooms')
      .select(PRICING_COLUMNS)
      .in('id', ids.slice(0, 100));
    if (error) {
      warn('leitura de catálogo na nuvem falhou:', error.message);
      return;
    }
    const rows = (data ?? []) as RoomPricingRow[];
    if (rows.length) {
      log(`catálogo actualizado para ${rows.length} quarto(s) via Realtime`);
      await applyPricingRows(rows);
    }
  } catch (err) {
    warn('excepção ao ler catálogo da nuvem:', err);
  }
}

function scheduleFlush(): void {
  if (debounceTimer !== null) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushPending();
  }, DEBOUNCE_MS);
}

/** Polling de segurança: compara o catálogo da nuvem com o local e grava só diffs. */
async function pollPricing(): Promise<void> {
  if (!supabaseClient) return;
  try {
    const [cloud, local] = await Promise.all([
      supabaseClient.from('hotel_rooms').select(PRICING_COLUMNS).limit(500),
      localQuery<RoomPricingRow[]>('hotel_rooms.list', { limit: 500 }),
    ]);
    if (cloud.error) {
      warn('polling: leitura da nuvem falhou:', cloud.error.message);
      return;
    }
    const localById = new Map<string, RoomPricingRow>();
    for (const row of local ?? []) localById.set(String(row.id), row);
    const changed: RoomPricingRow[] = [];
    for (const row of (cloud.data ?? []) as RoomPricingRow[]) {
      const mine = localById.get(String(row.id));
      if (
        !mine ||
        Number(mine.price_per_night) !== Number(row.price_per_night) ||
        mine.room_type !== row.room_type ||
        String(mine.floor ?? '') !== String(row.floor ?? '') ||
        (mine.description ?? '') !== (row.description ?? '')
      ) {
        changed.push(row);
      }
    }
    if (changed.length) {
      log(`polling: ${changed.length} quarto(s) com catálogo divergente → a actualizar`);
      await applyPricingRows(changed);
    }
  } catch (err) {
    warn('polling: excepção:', err);
  }
}

function subscribe(): void {
  if (!supabaseClient) return;
  try {
    channel = supabaseClient
      .channel('hr_inbound_room_pricing')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hotel_rooms' },
        (payload: any) => {
          const id = payload?.new?.id ?? payload?.old?.id;
          if (id) {
            pendingIds.add(String(id));
            scheduleFlush();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_rates' },
        () => {
          // Tarifas horárias vivem só na nuvem: notifica para o RoomBoard
          // reexibir a tarifa efectiva sem esperar pelo foco/polling.
          emitRoomEvent({ type: 'room-status' });
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          log('Realtime SUBSCRIBED — catálogo de quartos e tarifas em escuta');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          warn(`Realtime ${status} — nova tentativa em 30s (o polling de 60s cobre entretanto)`);
          if (retryTimer === null && started) {
            retryTimer = setTimeout(() => {
              retryTimer = null;
              if (started) {
                try {
                  void supabaseClient?.removeChannel(channel);
                } catch { /* canal já morto */ }
                channel = null;
                subscribe();
              }
            }, 30_000);
          }
        }
      });
  } catch (err) {
    warn('falha ao subscrever o canal de catálogo:', err);
  }
}

/**
 * Liga a sincronização de preços/catálogo. Idempotente — pode ser chamada em
 * cada renovação de sessão sem duplicar canais nem timers.
 */
export function startCloudPricingSync(): void {
  if (started) return;
  if (!isSupabaseConfigured || !supabaseClient) {
    warn('Supabase não configurado — sincronização de catálogo desativada');
    return;
  }
  started = true;
  log('arranque (Realtime + polling de ' + POLL_INTERVAL_MS / 1000 + 's)');
  subscribe();
  void pollPricing();
  pollingTimer = setInterval(() => {
    void pollPricing();
  }, POLL_INTERVAL_MS);
}
