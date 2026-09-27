import { useCallback, useEffect, useState } from 'react';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Aviso de uma reserva acabada de criar no site público do hotel.
 */
export interface ReservationNotice {
  id: string;
  reference: string | null;
  roomNumber: string | null;
  guestName: string;
  serviceType: string;
  checkInDate: string | null;
  totalAmount: number;
  receivedAt: number;
}

interface UseSiteReservationsResult {
  /** Última reserva recebida, ou `null` se não houver aviso pendente. */
  notice: ReservationNotice | null;
  /** `true` quando o canal realtime está efectivamente subscrito. */
  live: boolean;
  limpar: () => void;
}

/**
 * Notifica o POS, em tempo real, das reservas criadas no site vitrine.
 *
 * O site escreve em `hotel_reservations` com a chave `anon`; o POS recebe o
 * evento pelo canal `postgres_changes` do Supabase. O filtro por `tenant_id`
 * impede que um operador veja reservas de outro hotel, e a RLS
 * (`reservations_select_lodging`) decide na mesma hora se o operador tem
 * permissão para as ler — sem SELECT não chega nenhum evento, portanto não há
 * aqui nenhuma via contornar política nenhuma.
 *
 * A subscrição só existe com sessão iniciada e com perfil operacional
 * (`canOperate`): perfis de gestão não abrem comandas e não precisam deste
 * alerta.
 */
export function useSiteReservations(
  tenantId: string | null,
  enabled: boolean,
): UseSiteReservationsResult {
  const [notice, setNotice] = useState<ReservationNotice | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !tenantId) return;

    const client = getSupabase();
    const channel = client
      .channel(`pos-reservas-site-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hotel_reservations',
          filter: `tenant_id=eq.${tenantId}`,
        },
        payload => {
          const row = payload.new as unknown as Record<string, unknown>;
          setNotice({
            checkInDate: typeof row.check_in_date === 'string' ? row.check_in_date : null,
            guestName: typeof row.guest_name === 'string' ? row.guest_name : '—',
            id: typeof row.id === 'string' ? row.id : String(row.reference ?? ''),
            receivedAt: Date.now(),
            reference: typeof row.reference === 'string' ? row.reference : null,
            roomNumber: typeof row.room_number === 'string' ? row.room_number : null,
            serviceType: typeof row.service_type === 'string' ? row.service_type : '',
            totalAmount: typeof row.total_amount === 'number' ? row.total_amount : 0,
          });
        },
      )
      .subscribe(status => setLive(status === 'SUBSCRIBED'));

    return () => {
      setLive(false);
      void client.removeChannel(channel);
    };
  }, [enabled, tenantId]);

  const limpar = useCallback(() => setNotice(null), []);

  return { limpar, live, notice };
}
