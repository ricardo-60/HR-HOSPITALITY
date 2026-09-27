import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FlowChart } from '@/components/reports/FlowChart';
import { Bar, Card, EmptyState, Header, Loading, Metric, Refresh, Screen, TenantIdentity } from '@/components/ui';
import { formatKz, formatPercent } from '@/lib/format';
import { loadReportsSummary, type Result } from '@/lib/executiveApi';
import { useReportsRealtime } from '@/hooks/useReportsRealtime';
import { useExecutive } from '@/providers/ExecutiveProvider';
import type { ReportPeriod, ReportsSummary } from '@/types/executive';

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
];

/**
 * Relatórios do painel executivo: KPIs do período, receitas vs despesas por dia
 * e decomposição por origem e categoria.
 *
 * Só de leitura. O razão é sincronizado (`hr_sync_financial_entries`) antes de
 * cada leitura e as alterações a `daily_expenses`/`financial_transactions`
 * chegam por realtime, pelo que uma despesa registada no painel aparece aqui
 * sem recarregar.
 */
export default function ReportsScreen() {
  const router = useRouter();
  const { session, profile, tenantIdentity } = useExecutive();

  const [period, setPeriod] = useState<ReportPeriod>(30);
  const [data, setData] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result: Result<ReportsSummary> = await loadReportsSummary(period, profile?.tenantId ?? null);
    if (result.ok) {
      setData(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [period, profile?.tenantId]);

  const { live } = useReportsRealtime(profile?.tenantId ?? null, session === 'ready', () => void load());

  useEffect(() => {
    if (session !== 'ready') return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void load().finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session, period, load]);

  if (session === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-ocean-dark">
        <Loading label="A verificar a sessão…" />
      </View>
    );
  }

  if (session !== 'ready' || !profile) {
    return (
      <Screen>
        <Card className="gap-3">
          <Text className="text-sm text-white/70">Inicia sessão na app de gestão para ver os relatórios.</Text>
        </Card>
      </Screen>
    );
  }

  const displayName = tenantIdentity?.companyName ?? tenantIdentity?.name ?? 'Hotel';
  const movements = data ? data.receitas + data.despesas : 0;
  const maxSource = Math.max(...(data?.receitasPorOrigem.map(row => row.total) ?? [1]), 1);
  const maxCategory = Math.max(...(data?.despesasPorCategoria.map(row => row.total) ?? [1]), 1);

  return (
    <Screen refreshControl={<Refresh refreshing={loading} onRefresh={() => void load()} />}>
      <Header title={displayName} subtitle="Relatórios" />
      <TenantIdentity identity={tenantIdentity} />

      {error ? (
        <Card>
          <Text className="text-sm text-rose-200">{error}</Text>
        </Card>
      ) : null}

      {live && !error ? (
        <Text className="text-[11px] font-bold uppercase tracking-wider text-emerald-300/80">
          Tempo real activo · razão e despesas
        </Text>
      ) : null}

      <Card className="flex-row gap-2">
        {PERIODS.map(option => {
          const active = period === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setPeriod(option.value)}
              className={`flex-1 items-center rounded-2xl border px-3 py-2.5 ${
                active ? 'border-gold bg-gold' : 'border-white/15 bg-white/5'
              }`}
            >
              <Text className={`text-xs font-black ${active ? 'text-ocean' : 'text-white/60'}`}>{option.label}</Text>
            </Pressable>
          );
        })}
      </Card>

      {loading && !data ? (
        <Loading label="A consolidar o razão…" />
      ) : data ? (
        <>
          <View className="flex-row gap-3">
            <Metric label="Receitas no período" value={formatKz(data.receitas)} tone="inflow" />
            <Metric label="Despesas no período" value={formatKz(data.despesas)} tone="outflow" />
          </View>
          <View className="flex-row gap-3">
            <Metric label="Lucro líquido" value={formatKz(data.lucro)} tone={data.lucro >= 0 ? 'inflow' : 'outflow'} />
            <Metric label="Taxa de ocupação" value={formatPercent(data.occupancyRate)} />
          </View>

          {movements === 0 ? (
            <EmptyState
              title="Sem movimentos no período"
              hint="O razão é sincronizado antes de ler; uma despesa registada no painel aparece em tempo real."
            />
          ) : (
            <>
              <View className="gap-3">
                <Text className="text-xs font-black uppercase tracking-wider text-white/45">
                  Receitas vs despesas · por dia
                </Text>
                <Card>
                  <FlowChart series={data.series} />
                </Card>
              </View>

              <View className="gap-3">
                <Text className="text-xs font-black uppercase tracking-wider text-white/45">Receitas por origem</Text>
                {data.receitasPorOrigem.length === 0 ? (
                  <EmptyState title="Sem receitas no período" />
                ) : (
                  <Card className="gap-4">
                    {data.receitasPorOrigem.map(row => (
                      <Bar
                        key={row.key}
                        label={row.label}
                        value={formatKz(row.total)}
                        rawValue={row.total}
                        max={maxSource}
                        tone="inflow"
                      />
                    ))}
                    <View className="flex-row items-center justify-between border-t border-white/10 pt-3">
                      <Text className="text-sm font-black text-white">Total</Text>
                      <Text className="text-lg font-black text-inflow">{formatKz(data.receitas)}</Text>
                    </View>
                  </Card>
                )}
              </View>

              <View className="gap-3">
                <Text className="text-xs font-black uppercase tracking-wider text-white/45">
                  Despesas por categoria
                </Text>
                {data.despesasPorCategoria.length === 0 ? (
                  <EmptyState title="Sem despesas no período" />
                ) : (
                  <Card className="gap-4">
                    {data.despesasPorCategoria.map(row => (
                      <Bar
                        key={row.key}
                        label={row.label}
                        value={formatKz(row.total)}
                        rawValue={row.total}
                        max={maxCategory}
                        tone="gold"
                      />
                    ))}
                    <View className="flex-row items-center justify-between border-t border-white/10 pt-3">
                      <Text className="text-sm font-black text-white">Total</Text>
                      <Text className="text-lg font-black text-gold">{formatKz(data.despesas)}</Text>
                    </View>
                  </Card>
                )}
              </View>
            </>
          )}

          <Card className="gap-2">
            <Text className="text-[10px] font-black uppercase tracking-wider text-white/40">Como ler isto</Text>
            <Text className="text-sm text-white/60 leading-relaxed">
              O razão consolida comandas pagas (POS), diárias de reservas confirmadas e despesas
              registadas. O lucro é a diferença entre entradas e saídas do período — inclui o que foi
              lançado na conta do quarto e só é recebido no checkout geral.
            </Text>
          </Card>
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/')}
        className="items-center rounded-2xl border border-white/20 bg-white/5 px-5 py-3 active:opacity-80"
      >
        <Text className="text-sm font-black text-white">Voltar ao painel</Text>
      </Pressable>
    </Screen>
  );
}
