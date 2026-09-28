import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BillingCompareChart } from '@/components/reports/BillingCompareChart';
import { FlowChart } from '@/components/reports/FlowChart';
import { RankList } from '@/components/reports/RankList';
import { Bar, Card, EmptyState, Header, Loading, Metric, Refresh, Screen, TenantIdentity } from '@/components/ui';
import { formatKz, formatKzCompact, formatPercent } from '@/lib/format';
import {
  isModuleUnavailable,
  loadHoursVsNights,
  loadPreBills,
  loadReportsSummary,
  loadTopMenus,
  MODULE_UNAVAILABLE_MESSAGE,
  type Result,
} from '@/lib/executiveApi';
import { useReportsRealtime } from '@/hooks/useReportsRealtime';
import { useExecutive } from '@/providers/ExecutiveProvider';
import type {
  HoursVsNightsSummary,
  PreBillsSummary,
  ReportPeriod,
  ReportsSummary,
  TopMenusSummary,
} from '@/types/executive';

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
];

/**
 * Cartão de um relatório novo. Enquanto carrega mostra um aviso curto;
 * quando falha, distingue "módulo não activado" (migração 011 por aplicar)
 * de qualquer outro erro — nos dois casos um cartão compacto, nunca um
 * crash do ecrã.
 */
function ReportSection<T>({
  title,
  result,
  render,
}: {
  title: string;
  result: Result<T> | null;
  render: (data: T) => ReactNode;
}) {
  return (
    <View className="gap-3">
      <Text className="text-xs font-black uppercase tracking-wider text-white/45">{title}</Text>
      {result === null ? (
        <Card className="py-3">
          <Text className="text-xs text-white/45">A carregar…</Text>
        </Card>
      ) : result.ok ? (
        render(result.data)
      ) : (
        <Card className="gap-1 py-3">
          <Text className="text-xs font-semibold text-gold">
            {isModuleUnavailable(result.error) ? MODULE_UNAVAILABLE_MESSAGE : result.error}
          </Text>
        </Card>
      )}
    </View>
  );
}

/**
 * Relatórios do painel executivo: KPIs do período, receitas vs despesas por dia
 * e decomposição por origem e categoria.
 *
 * Por baixo vêm os três relatórios da migração 011 — horas vs diárias, top
 * pratos/bebidas e pré-contas emitidas — cada um no seu cartão, para que a
 * falta da migração num cartão não toque nos restantes.
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

  // Relatórios da migração 011. `null` = ainda a carregar; um erro de
  // esquema fica guardado no resultado e o cartão degrada para aviso.
  const [horas, setHoras] = useState<Result<HoursVsNightsSummary> | null>(null);
  const [topMenus, setTopMenus] = useState<Result<TopMenusSummary> | null>(null);
  const [preContas, setPreContas] = useState<Result<PreBillsSummary> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [summary, horasResult, topMenusResult, preBillsResult] = await Promise.all([
      loadReportsSummary(period, profile?.tenantId ?? null),
      loadHoursVsNights(period),
      loadTopMenus(period),
      loadPreBills(period),
    ]);
    if (summary.ok) {
      setData(summary.data);
      setError(null);
    } else {
      setError(summary.error);
    }
    setHoras(horasResult);
    setTopMenus(topMenusResult);
    setPreContas(preBillsResult);
    setLoading(false);
  }, [period, profile?.tenantId]);

  // Tabelas novas só entram na subscrição quando o relatório respectivo
  // já leu com sucesso — sem migração 011 não há canal a assinar.
  const extraTables = useMemo(() => {
    const tables: string[] = [];
    if (horas?.ok) tables.push('hourly_billing');
    if (preContas?.ok) tables.push('pre_bill_logs');
    return tables;
  }, [horas, preContas]);

  const onChange = useCallback(() => {
    void load();
  }, [load]);

  const { live, liveModules } = useReportsRealtime(
    profile?.tenantId ?? null,
    session === 'ready',
    onChange,
    extraTables,
  );

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
          Tempo real activo · razão e despesas{liveModules ? ', horas e pré-contas' : ''}
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

          {/* ── Relatórios da migração 011: cada um degrada no seu cartão ── */}
          <ReportSection
            title="Horas vs diárias · por dia"
            result={horas}
            render={summary => (
              <View className="gap-3">
                <View className="flex-row gap-3">
                  <Metric label="Receita por horas" value={formatKz(summary.totalHoras)} tone="inflow" />
                  <Metric label="Receita em diárias" value={formatKz(summary.totalDiarias)} tone="inflow" />
                </View>
                <View className="flex-row gap-3">
                  <Metric label="Sessões activas" value={String(summary.sessoesActivas)} />
                  <Metric label="Ticket médio / hora" value={formatKz(summary.ticketMedioHora)} />
                </View>
                {summary.totalHoras === 0 && summary.totalDiarias === 0 ? (
                  <EmptyState title="Sem facturação de quartos no período" />
                ) : (
                  <Card>
                    <BillingCompareChart series={summary.series} />
                  </Card>
                )}
                <Text className="text-[11px] leading-relaxed text-white/40">
                  As sessões horárias em curso ainda não entram na receita: só contam quando são
                  fechadas e liquidadas. Ticket médio = receita por hora vendida (bloco + extensões).
                </Text>
              </View>
            )}
          />

          <ReportSection
            title="Top pratos / top bebidas · por receita"
            result={topMenus}
            render={summary =>
              summary.pratos.length === 0 && summary.bebidas.length === 0 && summary.outros.revenue === 0 ? (
                <EmptyState
                  title="Sem vendas no período"
                  hint="O ranking lê as comandas pagas do POS no período seleccionado."
                />
              ) : (
                <View className="gap-3">
                  <Card className="gap-3">
                    <Text className="text-[10px] font-black uppercase tracking-wider text-gold">Top pratos</Text>
                    {summary.pratos.length === 0 ? (
                      <Text className="text-xs text-white/45">Sem comida vendida no período.</Text>
                    ) : (
                      <RankList items={summary.pratos} tone="gold" />
                    )}
                  </Card>
                  <Card className="gap-3">
                    <Text className="text-[10px] font-black uppercase tracking-wider text-aqua">Top bebidas</Text>
                    {summary.bebidas.length === 0 ? (
                      <Text className="text-xs text-white/45">Sem bebidas vendidas no período.</Text>
                    ) : (
                      <RankList items={summary.bebidas} tone="aqua" />
                    )}
                  </Card>
                  <Text className="text-[11px] leading-relaxed text-white/40">
                    Outros artigos (serviços e restantes categorias): {formatKz(summary.outros.revenue)} em{' '}
                    {summary.outros.units} unidades.
                  </Text>
                </View>
              )
            }
          />

          <ReportSection
            title="Pré-contas emitidas"
            result={preContas}
            render={summary => {
              if (summary.documents === 0) {
                return (
                  <EmptyState
                    title="Sem pré-contas no período"
                    hint="Cada pré-conta e extrato emitido no POS fica registado aqui."
                  />
                );
              }
              const maxTipo = Math.max(...summary.porTipo.map(row => row.count), 1);
              const maxContexto = Math.max(...summary.porContexto.map(row => row.count), 1);
              return (
                <View className="gap-3">
                  <View className="flex-row gap-3">
                    <Metric label="Documentos" value={String(summary.documents)} />
                    <Metric label="Valor total" value={formatKz(summary.total)} tone="inflow" />
                  </View>

                  <View className="gap-3">
                    <Text className="text-xs font-black uppercase tracking-wider text-white/45">
                      Por tipo de documento
                    </Text>
                    <Card className="gap-4">
                      {summary.porTipo.map(row => (
                        <Bar
                          key={row.key}
                          label={row.label}
                          value={`${row.count} · ${formatKzCompact(row.total)}`}
                          rawValue={row.count}
                          max={maxTipo}
                          tone="gold"
                        />
                      ))}
                    </Card>
                  </View>

                  <View className="gap-3">
                    <Text className="text-xs font-black uppercase tracking-wider text-white/45">Por contexto</Text>
                    <Card className="gap-4">
                      {summary.porContexto.map(row => (
                        <Bar
                          key={row.key}
                          label={row.label}
                          value={`${row.count} · ${formatKzCompact(row.total)}`}
                          rawValue={row.count}
                          max={maxContexto}
                          tone="aqua"
                        />
                      ))}
                    </Card>
                  </View>

                  <Card className="gap-1 py-3">
                    <Text className="text-[11px] leading-relaxed text-white/50">
                      Média de {summary.avgLines.toFixed(1).replace('.', ',')} itens por documento nos últimos{' '}
                      {summary.days} dias. Cada emissão congela a comanda e fica na auditoria da unidade.
                    </Text>
                  </Card>
                </View>
              );
            }}
          />

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
