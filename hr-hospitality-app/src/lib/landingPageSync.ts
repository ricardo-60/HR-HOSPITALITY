/**
 * HR-HOSPITALITY — Sincronização Landing Page ⇄ App Local
 *
 * Este módulo fornece funções para a Landing Page (deployada em Vercel)
 * consultar o estado atual dos quartos e reservas, bem como solicitar
 * uma atualização de página quando o app local sincroniza alterações para
 * a nuvem (Supabase).
 *
 * Fluxo:
 *   1. App local grava no SQLite local E no Supabase (syncEngine.ts).
 *   2. Landing Page lê o estado diretamente do Supabase (anon key partilhada).
 *   3. Landing Page usa polling curto ou canal Realtime para detetar mudanças.
 *   4. Em caso de mudança, a página chama `refreshPage()` para buscar dados novos.
 */

import React from 'react';
import { supabase } from './supabase';

/**
 * Prefixo de log de diagnóstico da sincronização.
 * Visível no DevTools do Servidor (Electron) para rastrear cada etapa.
 */
const LOG = '[landingPageSync]';

function logInfo(...args: unknown[]): void {
  console.log(LOG, ...args);
}

function logWarn(...args: unknown[]): void {
  console.warn(LOG, ...args);
}

function logError(...args: unknown[]): void {
  console.error(LOG, ...args);
}

/** Formata um erro de PostgREST/RLS de forma legível. */
function describe(error: { code?: string; message?: string } | null): string {
  if (!error) return 'erro desconhecido';
  return `${error.code || 'sem código'}: ${error.message || 'sem mensagem'}`;
}

// --- 1. Dados de leitura (mirror read-only do Supabase) ---

/** Busca todas as salas com o seu status atual. */
export async function fetchRoomStatus() {
  if (!supabase) {
    logError('fetchRoomStatus: Supabase client não inicializado');
    throw new Error('Supabase client não inicializado');
  }
  logInfo('fetchRoomStatus: a ler hotel_rooms na nuvem…');
  try {
    const { data, error } = await supabase.from('hotel_rooms').select('*');
    if (error) {
      logError('fetchRoomStatus: FALHOU →', describe(error));
      throw error;
    }
    logInfo(`fetchRoomStatus: OK — ${(data || []).length} quarto(s)`);
    return data || [];
  } catch (err) {
    logError('fetchRoomStatus: exceção →', err instanceof Error ? err.message : err);
    throw err;
  }
}

/** Busca todas as reservas ativas (CHECKED_IN + CONFIRMADA + PENDENTE_PAGAMENTO). */
export async function fetchActiveReservations() {
  if (!supabase) {
    logError('fetchActiveReservations: Supabase client não inicializado');
    throw new Error('Supabase client não inicializado');
  }
  logInfo('fetchActiveReservations: a ler hotel_reservations na nuvem…');
  try {
    const { data, error } = await supabase
      .from('hotel_reservations')
      .select('*')
      .in('status', ['CHECKED_IN', 'CONFIRMADA', 'PENDENTE_PAGAMENTO']);
    if (error) {
      logError('fetchActiveReservations: FALHOU →', describe(error));
      if (String(error.code) === '42501' || /permission denied/i.test(error.message || '')) {
        logError('  → RLS: o `anon` não tem SELECT em hotel_reservations.',
          'A app local deve usar a sessão autenticada (ver cloudInboundSync.ts).');
      }
      throw error;
    }
    logInfo(`fetchActiveReservations: OK — ${(data || []).length} reserva(s)`);
    return data || [];
  } catch (err) {
    logError('fetchActiveReservations: exceção →', err instanceof Error ? err.message : err);
    throw err;
  }
}

/** Busca reservas que cobrem uma data específica. */
export async function fetchReservationsForDate(dateISO: string) {
  if (!supabase) {
    logError('fetchReservationsForDate: Supabase client não inicializado');
    throw new Error('Supabase client não inicializado');
  }
  logInfo(`fetchReservationsForDate(${dateISO}): a ler na nuvem…`);
  try {
    const { data, error } = await supabase
      .from('hotel_reservations')
      .select('*')
      .gte('check_in_date', dateISO)
      .lte('check_out_date', dateISO)
      .in('status', ['CHECKED_IN', 'CONFIRMADA', 'PENDENTE_PAGAMENTO']);
    if (error) {
      logError(`fetchReservationsForDate(${dateISO}): FALHOU →`, describe(error));
      throw error;
    }
    logInfo(`fetchReservationsForDate(${dateISO}): OK — ${(data || []).length} reserva(s)`);
    return data || [];
  } catch (err) {
    logError('fetchReservationsForDate: exceção →', err instanceof Error ? err.message : err);
    throw err;
  }
}

// --- 2. Subscription / Realtime (atualização instantânea) ---

/**
 * Regista o ciclo de vida de um canal Realtime com logs detalhados.
 * `status` é um dos: `SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`.
 */
function logChannelStatus(channelName: string, status: string, err?: Error): void {
  if (status === 'SUBSCRIBED') {
    logInfo(`canal "${channelName}" → SUBSCRIBED (a escutar eventos)`);
  } else if (status === 'CHANNEL_ERROR') {
    logError(`canal "${channelName}" → CHANNEL_ERROR:`, err?.message ?? 'erro desconhecido');
  } else if (status === 'TIMED_OUT') {
    logError(`canal "${channelName}" → TIMED_OUT:`, err?.message ?? 'sem resposta do Realtime');
  } else if (status === 'CLOSED') {
    logWarn(`canal "${channelName}" → CLOSED`);
  } else {
    logInfo(`canal "${channelName}" → status: ${status}`);
  }
}

/** Subscreve alterações de hotel_rooms via Supabase Realtime.
 * O callback é chamado sempre que um quarto muda de status (check-in, check-out, limpeza, manutenção).
 * Retorna a função de cancelamento (unsubscribe). */
export function subscribeRoomChanges(callback: (room: any) => void) {
  if (!supabase) {
    logWarn('subscribeRoomChanges: Supabase client indisponível — sem Realtime');
    return () => { };
  }
  const channelName = 'hr_hospitality_room_changes';
  logInfo(`a subscrever "${channelName}" (postgres_changes em hotel_rooms)…`);
  const channel = supabase.channel(channelName);
  channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hotel_rooms' },
      (payload: any) => {
        // A payload pode trazer New e/ou Old
        const room = payload?.New || payload?.Old;
        logInfo(`postgres_changes hotel_rooms (eventType=${payload?.eventType}) id=${room?.id ?? '?'} status=${room?.status ?? '?'}`);
        if (room) callback(room);
      }
    )
    .subscribe((status: string, err?: Error) => logChannelStatus(channelName, status, err));
  // Devolve unsubscribe para quando o componente desmontar
  return () => {
    logInfo(`a cancelar "${channelName}"`);
    try { channel.unsubscribe(); } catch { }
  };
}

/** Subscreve alterações de hotel_reservations via Supabase Realtime. */
export function subscribeReservationChanges(callback: (reservation: any) => void) {
  if (!supabase) {
    logWarn('subscribeReservationChanges: Supabase client indisponível — sem Realtime');
    return () => { };
  }
  const channelName = 'hr_hospitality_reservation_changes';
  logInfo(`a subscrever "${channelName}" (postgres_changes em hotel_reservations)…`);
  const channel = supabase.channel(channelName);
  channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hotel_reservations' },
      (payload: any) => {
        const reservation = payload?.New || payload?.Old;
        logInfo(`postgres_changes hotel_reservations (eventType=${payload?.eventType}) id=${reservation?.id ?? '?'} convidado=${reservation?.guest_name ?? '?'}`);
        if (reservation) callback(reservation);
      }
    )
    .subscribe((status: string, err?: Error) => logChannelStatus(channelName, status, err));
  return () => {
    logInfo(`a cancelar "${channelName}"`);
    try { channel.unsubscribe(); } catch { }
  };
}

/** Polling rápido: busca o estado atual a cada intervalo (ms).
 * Utilize este hook em componentes client-side da Landing Page para
 * detetar mudanças quando o Realtime não estiver disponível. */
export function useRoomStatusPolling(intervalMs = 15000) {
  // Este hook é destinado a ser usado em ambientes browser/client.
  // Retorna um objeto reativo e a função de refrescar agora.
  const [rooms, setRooms] = React.useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = React.useState<number>(0);

  const refresh = React.useCallback(async () => {
    const cycle = Math.round(intervalMs / 1000);
    logInfo(`ciclo de polling (a cada ${cycle}s) → fetchRoomStatus()`);
    try {
      const data = await fetchRoomStatus();
      setRooms(data);
      setLastUpdate(Date.now());
      logInfo(`ciclo de polling: OK — ${data.length} quarto(s), última atualização ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      logWarn('ciclo de polling falhou:', e instanceof Error ? e.message : e);
    }
  }, [intervalMs]);

  // Primeira carga + polling intervalado
  React.useEffect(() => {
    logInfo(`polling iniciado (intervalo ${intervalMs}ms)`);
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => {
      logInfo('polling terminado');
      clearInterval(timer);
    };
  }, [refresh, intervalMs]);

  return { rooms, lastUpdate, refresh };
}

// --- 3. Solicitar atualização ao app local (via supabase function ou webhook) ---

/**
 * Sinaliza ao Supabase que uma alteração ocorreu e a Landing Page deve
 * buscar dados frescos. Em setups com Supabase Edge Functions ou webhooks,
 * esta função pode disparar a revalidação. Em configurações simpler,
 * a Landing Page usa o polling `useRoomStatusPolling` acima.
 *
 * Nota: esta função é um placeholder para futuras extensões (Edge Functions,
 * webhooks GitHub, etc.). O mecanismo principal de atualização é o Realtime
 * + polling client-side, que já reflete as mudanças assim que o app local
 * as grava no Supabase.
 */
export function triggerLandingPageRefresh(): Promise<{ success: boolean; error?: string }> {
  // Em produção, aqui seria chamado um Edge Function ou webhook que
  // dispara `npm run build` ou ISR revalidation no Vercel.
  // Por enquanto, retornamos success para indicar que o polling/client-side
  // é o mecanismo ativo.
  return Promise.resolve({ success: true });
}

export type { RoomEventType } from '@/lib/roomEvents';