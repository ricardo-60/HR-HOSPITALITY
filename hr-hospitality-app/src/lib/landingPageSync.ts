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

// --- 1. Dados de leitura (mirror read-only do Supabase) ---

/** Busca todas as salas com o seu status atual. */
export async function fetchRoomStatus() {
  if (!supabase) throw new Error('Supabase client não inicializado');
  const { data, error } = await supabase.from('hotel_rooms').select('*');
  if (error) throw error;
  return data || [];
}

/** Busca todas as reservas ativas (CHECKED_IN + CONFIRMADA + PENDENTE_PAGAMENTO). */
export async function fetchActiveReservations() {
  if (!supabase) throw new Error('Supabase client não inicializado');
  const { data, error } = await supabase
    .from('hotel_reservations')
    .select('*')
    .in('status', ['CHECKED_IN', 'CONFIRMADA', 'PENDENTE_PAGAMENTO']);
  if (error) throw error;
  return data || [];
}

/** Busca reservas que cobrem uma data específica. */
export async function fetchReservationsForDate(dateISO: string) {
  if (!supabase) throw new Error('Supabase client não inicializado');
  const { data, error } = await supabase
    .from('hotel_reservations')
    .select('*')
    .gte('check_in_date', dateISO)
    .lte('check_out_date', dateISO)
    .in('status', ['CHECKED_IN', 'CONFIRMADA', 'PENDENTE_PAGAMENTO']);
  if (error) throw error;
  return data || [];
}

// --- 2. Subscription / Realtime (atualização instantânea) ---

/** Subscreve alterações de hotel_rooms via Supabase Realtime.
 * O callback é chamado sempre que um quarto muda de status (check-in, check-out, limpeza, manutenção).
 * Retorna a função de cancelamento (unsubscribe). */
export function subscribeRoomChanges(callback: (room: any) => void) {
  if (!supabase) return () => { };
  const channel = supabase.channel('hr_hospitality_room_changes');
  channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hotel_rooms' },
      (payload: any) => {
        // A payload pode trazer New e/or Old
        const room = payload?.New || payload?.Old;
        if (room) callback(room);
      }
    )
    .subscribe();
  // Devolve unsubscribe para quando o componente desmontar
  return () => {
    try { channel.unsubscribe(); } catch { }
  };
}

/** Subscreve alterações de hotel_reservations via Supabase Realtime. */
export function subscribeReservationChanges(callback: (reservation: any) => void) {
  if (!supabase) return () => { };
  const channel = supabase.channel('hr_hospitality_reservation_changes');
  channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hotel_reservations' },
      (payload: any) => {
        const reservation = payload?.New || payload?.Old;
        if (reservation) callback(reservation);
      }
    )
    .subscribe();
  return () => {
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
    try {
      const data = await fetchRoomStatus();
      setRooms(data);
      setLastUpdate(Date.now());
    } catch (e) {
      console.warn('[landingPageSync] polling falhou:', e);
    }
  }, []);

  // Primeira carga + polling intervalado
  React.useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh]);

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
  // Por enquanto, retornamos success para indicar que o polling/client‑side
  // é o mecanismo ativo.
  return Promise.resolve({ success: true });
}

export type { RoomEventType } from '@/lib/roomEvents';