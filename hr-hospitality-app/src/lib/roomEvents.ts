import { useEffect } from 'react';
/**
 * Barramento de eventos de estado do hotel (quartos / reservas / consumos).
 *
 * Objectivo: quando o check-in, o check-out, uma cancelação ou qualquer outra
 * escrita acontece — mesmo que noutro separador ou noutro módulo — o Mapa de
 * Quartos, o Dashboard e o painel de reservas reactualizam-se **sem recarregar
 * a página**.
 *
 * Camadas de garantia:
 *  1. evento local (instantâneo, mesmo separador);
 *  2. `visibilitychange`/`focus` (ao voltar ao separador);
 *  3. polling de segurança (outros postos/terminais).
 */

export type RoomEventType =
    | 'check-in'
    | 'check-out'
    | 'room-status'
    | 'reservation'
    | 'consumption'
    | 'client';

export interface RoomEvent {
    type: RoomEventType;
    roomId?: string;
    roomNumber?: string;
    reservationId?: string;
    clientId?: string;
    /** Epoch ms */
    at: number;
}

type Listener = (event: RoomEvent) => void;

const listeners = new Set<Listener>();

/** Emite um evento de estado para todos os subscritores vivos. */
export function emitRoomEvent(payload: Omit<RoomEvent, 'at'>): void {
    const event: RoomEvent = { ...payload, at: Date.now() };
    listeners.forEach(listener => {
        try {
            listener(event);
        } catch (error) {
            console.warn('[roomEvents] listener falhou:', error);
        }
    });
}

/** Subscreve o barramento. Devolve a função de cancelamento. */
export function subscribeRoomEvents(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * Liga um callback de refresh ao barramento + foco + polling.
 *
 * `refresh` deve ser estável (useCallback com deps vazias) para que a
 * subscricao não seja recriada a cada render.
 */
export function useRoomSync(
    refresh: () => void | Promise<void>,
    { intervalMs = 15000 }: { intervalMs?: number } = {}
): void {
    useEffect(() => {
        const run = () => {
            if (typeof document !== 'undefined' && document.hidden) return;
            void refresh();
        };

        const unsubscribe = subscribeRoomEvents(run);
        window.addEventListener('focus', run);
        document.addEventListener('visibilitychange', run);
        const timer = intervalMs > 0 ? window.setInterval(run, intervalMs) : undefined;

        return () => {
            unsubscribe();
            window.removeEventListener('focus', run);
            document.removeEventListener('visibilitychange', run);
            if (timer !== undefined) window.clearInterval(timer);
        };
    }, [refresh, intervalMs]);
}
