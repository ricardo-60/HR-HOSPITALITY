import { useEffect, useState } from 'react';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

interface UseReportsRealtimeResult {
  /** `true` quando os canais estão efectivamente subscritos. */
  live: boolean;
}

/**
 * Actualiza os relatórios em tempo real.
 *
 * Subscreve `daily_expenses` e `financial_transactions` (os dois na
 * publication `supabase_realtime`, migração 010) e chama `onChange` em
 * qualquer INSERT/UPDATE/DELETE do tenant: uma despesa registada no painel
 * web aparece no ecrã sem recarregar. A RLS decide se o operador recebe o
 * evento — sem SELECT na tabela não há evento, por aqui não há como contornar
 * política nenhuma.
 */
export function useReportsRealtime(tenantId: string | null, enabled: boolean, onChange: () => void): UseReportsRealtimeResult {
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !tenantId) return;

    const client = getSupabase();
    const channel = client
      .channel(`exec-relatorios-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_expenses', filter: `tenant_id=eq.${tenantId}` },
        () => onChange(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'financial_transactions', filter: `tenant_id=eq.${tenantId}` },
        () => onChange(),
      )
      .subscribe(status => setLive(status === 'SUBSCRIBED'));

    return () => {
      setLive(false);
      void client.removeChannel(channel);
    };
  }, [enabled, tenantId, onChange]);

  return { live };
}
