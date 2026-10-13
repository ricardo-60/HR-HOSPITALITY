import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { getSupabase } from '@/lib/supabase';

type Listener = () => void;

/**
 * Watcher global de tempo real para `hotel_rooms` e `hotel_reservations`.
 *
 * O servidor (Supabase) é a única fonte da verdade: quando a recepção muda um
 * estado, o hotel altera uma tarifa ou entra uma reserva (Landing/App), este
 * watcher notifica os hooks `useCachedQuery` para revalidarem em silêncio — o
 * hóspede vê o preço e a disponibilidade novos sem reabrir o ecrã.
 *
 * Robustez:
 *  - junta notificações dentro de 400 ms (uma tempestade de eventos na BD
 *    produz UMA revalidação, não N queries);
 *  - se a canal cair (CHANNEL_ERROR/TIMED_OUT/CLOSED), recria-a com backoff
 *    exponencial (2 s → 60 s);
 *  - ao voltar ao primeiro plano (AppState "active") força retry imediato se a
 *    canal estiver morta e notifica de qualquer modo — nada fica "surdo" em
 *    silêncio depois de o telemóvel sair do app.
 *
 * Um único watcher serve todo o app (arrancado no RootLayout).
 */

/** Janela de coalescing de notificações. */
const COALESCE_MS = 400;
/** Backoff para recriar a canal se cair (o último valor repete-se). */
const RETRY_STEPS_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;

const listeners = new Set<Listener>();

let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let started = false;
let subscribed = false;
let attempts = 0;
let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: { remove: () => void } | null = null;

function notify(): void {
  if (coalesceTimer !== null) return;
  coalesceTimer = setTimeout(() => {
    coalesceTimer = null;
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // Um listener com erro nunca mata o watcher nem as notificações seguintes.
      }
    });
  }, COALESCE_MS);
}

function clearRetry(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleRetry(): void {
  if (retryTimer !== null || !started) return;
  const delay = RETRY_STEPS_MS[Math.min(attempts, RETRY_STEPS_MS.length - 1)];
  attempts += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    resubscribe();
  }, delay);
}

function resubscribe(): void {
  if (!started || !client) return;
  const previous = channel;
  channel = null;
  subscribed = false;
  if (previous) {
    try {
      void client.removeChannel(previous);
    } catch {
      // Canal já morto — não há nada a limpar.
    }
  }
  try {
    // Sufixo único: evita reutilizar uma canal ainda a fechar (mesmo motivo
    // do `watchStatement` do extrato, guestLedger.ts).
    const next = client.channel(`hotel-sync#${Date.now().toString(36)}`);
    channel = next;
    next
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_rooms' }, notify)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_reservations' }, notify)
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          subscribed = true;
          attempts = 0;
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false;
          scheduleRetry();
        }
      });
  } catch {
    scheduleRetry();
  }
}

function onAppStateChange(state: string): void {
  if (state !== 'active') return;
  if (!subscribed) {
    clearRetry();
    attempts = 0;
    resubscribe();
    return;
  }
  // Voltar ao ecrã = dados frescos, mesmo que um evento tenha sido perdido
  // enquanto o app esteve em segundo plano.
  notify();
}

/** Para o watcher e liberta timers/canais/AppState. Idempotente. */
export function stopHotelWatcher(): void {
  if (!started) return;
  started = false;
  subscribed = false;
  attempts = 0;
  clearRetry();
  if (coalesceTimer !== null) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
  appStateSub?.remove();
  appStateSub = null;
  const current = channel;
  channel = null;
  if (current && client) {
    try {
      void client.removeChannel(current);
    } catch {
      // Canal já morto.
    }
  }
  client = null;
}

/**
 * Arranca o watcher (idempotente — seguro em StrictMode/remounts).
 * Devolve a função de paragem para o `useEffect` do RootLayout.
 */
export function startHotelWatcher(): () => void {
  if (started) return stopHotelWatcher;
  client = getSupabase();
  if (!client) return stopHotelWatcher;
  started = true;
  resubscribe();
  appStateSub = AppState.addEventListener('change', onAppStateChange);
  return stopHotelWatcher;
}

/** Subscreve as notificações do watcher. Devolve a função de cancelamento. */
export function subscribeHotelSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
