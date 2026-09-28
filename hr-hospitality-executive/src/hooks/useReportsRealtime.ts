import { useEffect, useState } from 'react';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

interface UseReportsRealtimeResult {
  /** `true` quando os canais estão efectivamente subscritos. */
  live: boolean;
  /** `true` quando os módulos da migração 011 (horas/pré-contas) também estão. */
  liveModules: boolean;
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
 *
 * `extraTables` são as tabelas dos módulos novos (`hourly_billing`,
 * `pre_bill_logs`, migração 011). Vão num CANAL SEPARADO, com indicador
 * próprio, e só quando o relatório respectivo já leu com sucesso: se a
 * unidade ainda não activou a migração, falhar aqui não apaga o indicador
 * do razão nem parte o ecrã.
 */
export function useReportsRealtime(
  tenantId: string | null,
  enabled: boolean,
  onChange: () => void,
  extraTables: string[] = [],
): UseReportsRealtimeResult {
  const [live, setLive] = useState(false);
  const [liveModules, setLiveModules] = useState(false);

  // Chave estável: sem ela o array novo a cada render recriava os canais.
  const tablesKey = extraTables.join(',');

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !tenantId) return;

    const client = getSupabase();
    // O supabase-js REUSA a instancia quando o topico ja existe: um efeito
    // que corre de novo enquanto o canal anterior ainda fecha recebe o mesmo
    // objecto e o `.on('postgres_changes')` lanca. Sufixo proprio por
    // abertura mantem cada subscricao num canal novo.
    const sufixo = `#${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const channel = client
      .channel(`exec-relatorios-${tenantId}${sufixo}`)
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

    const tables = tablesKey ? tablesKey.split(',') : [];
    let modulesChannel: ReturnType<typeof client.channel> | null = null;
    if (tables.length > 0) {
      modulesChannel = client.channel(`exec-relatorios-modulos-${tenantId}${sufixo}`);
      for (const table of tables) {
        modulesChannel = modulesChannel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `tenant_id=eq.${tenantId}` },
          () => onChange(),
        );
      }
      modulesChannel.subscribe(status => setLiveModules(status === 'SUBSCRIBED'));
    }

    return () => {
      setLive(false);
      setLiveModules(false);
      void client.removeChannel(channel);
      if (modulesChannel) void client.removeChannel(modulesChannel);
    };
  }, [enabled, tenantId, onChange, tablesKey]);

  return { live, liveModules };
}
