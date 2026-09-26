import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Bar, Banner, Button, Card, EmptyState, Field, Header, Loading, Metric, Refresh, Screen } from '@/components/ui';
import { formatKz, formatKzCompact, formatPercent } from '@/lib/format';
import {
  loadOccupancy,
  loadRevenue,
  loadStockAlerts,
  loadTopProducts,
  type Result,
} from '@/lib/executiveApi';
import { useExecutive } from '@/providers/ExecutiveProvider';
import { METHOD_LABEL, type OccupancySummary, type PeriodSummary, type StockAlert, type TopProduct } from '@/types/executive';

/**
 * Painel executivo.
 *
 * Quatro blocos, na ordem em que um dono olha para o negócio: quanto entrou,
 * como estão os quartos, o que o bar vendeu, e o que está a acabar.
 */
export default function DashboardScreen() {
  const router = useRouter();
  const { session, profile, tenantName, signOut } = useExecutive();

  const [revenue, setRevenue] = useState<PeriodSummary | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancySummary | null>(null);
  const [top, setTop] = useState<TopProduct[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [revenueResult, occupancyResult, topResult, alertResult]: [
      Result<PeriodSummary>,
      Result<OccupancySummary>,
      Result<TopProduct[]>,
      Result<StockAlert[]>,
    ] = await Promise.all([
      loadRevenue(),
      loadOccupancy(),
      loadTopProducts(),
      loadStockAlerts(),
    ]);

    if (revenueResult.ok) setRevenue(revenueResult.data);
    if (occupancyResult.ok) setOccupancy(occupancyResult.data);
    if (topResult.ok) setTop(topResult.data);
    if (alertResult.ok) setAlerts(alertResult.data);

    const failure = [revenueResult, occupancyResult, topResult, alertResult].find(r => !r.ok);
    setError(failure && !failure.ok ? failure.error : null);
    setLoading(false);
  };

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
  }, [session]);

  if (session === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-ocean-dark">
        <Loading label="A verificar a sessão…" />
      </View>
    );
  }

  if (session !== 'ready' || !profile) {
    return <SignIn />;
  }

  const monthDelta =
    revenue && revenue.previousMonth > 0
      ? ((revenue.month - revenue.previousMonth) / revenue.previousMonth) * 100
      : null;

  const maxMethod = Math.max(...(revenue?.byMethod.map(m => m.total) ?? [1]), 1);

  return (
    <Screen refreshControl={<Refresh refreshing={loading} onRefresh={() => void load()} />}>
      <Header
        title={tenantName ?? 'Hotel'}
        subtitle={`${profile.name} · gestão`}
        right={<Button label="Sair" onPress={() => void signOut()} />}
      />

      {error ? <Banner tone="info" message={error} /> : null}

      {loading && !revenue ? (
        <Loading label="A consolidar o dia…" />
      ) : (
        <>
          {/* 1. Financeiro */}
          <View className="gap-3">
            <Text className="text-xs font-black uppercase tracking-wider text-white/45">
              Fluxo de caixa
            </Text>
            <View className="flex-row gap-3">
              <Metric label="Hoje" value={formatKzCompact(revenue?.day ?? 0)} tone="inflow" />
              <Metric label="Semana" value={formatKzCompact(revenue?.week ?? 0)} tone="inflow" />
            </View>
            <Metric label="Mês" value={formatKz(revenue?.month ?? 0)} delta={monthDelta} tone="inflow" />

            <Card className="gap-4">
              <Text className="text-[10px] font-black uppercase tracking-wider text-white/40">
                Por meio de pagamento · 30 dias
              </Text>
              {revenue && revenue.byMethod.some(method => method.total > 0) ? (
                revenue.byMethod.map(method => (
                  <Bar
                    key={method.method}
                    label={`${METHOD_LABEL[method.method]} (${method.orders})`}
                    rawValue={method.total}
                    value={formatKz(method.total)}
                    max={maxMethod}
                    tone={method.method === 'CONTA_DO_QUARTO' ? 'gold' : method.method === 'DINHEIRO' ? 'inflow' : 'aqua'}
                  />
                ))
              ) : (
                <Text className="text-xs text-white/40">
                  Ainda não há comandas liquidadas nos últimos 30 dias.
                </Text>
              )}
            </Card>
          </View>

          {/* 2. Ocupação */}
          <View className="gap-3">
            <Text className="text-xs font-black uppercase tracking-wider text-white/45">Ocupação</Text>
            <View className="flex-row gap-3">
              <Metric label="Taxa" value={formatPercent(occupancy?.rate ?? 0)} />
              <Metric label="Livres" value={String(occupancy?.available ?? 0)} tone="inflow" />
            </View>
            <Card className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-white/60">Ocupados</Text>
                <Text className="text-sm font-black text-white">
                  {occupancy?.occupied ?? 0} / {occupancy?.totalRooms ?? 0}
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-white/60">Fora de serviço</Text>
                <Text className="text-sm font-black text-white/60">{occupancy?.outOfService ?? 0}</Text>
              </View>
              <View className="h-2.5 w-full overflow-hidden rounded-full bg-white/8">
                <View
                  className="h-full rounded-full bg-aqua"
                  style={{ width: `${Math.max(2, occupancy?.rate ?? 0)}%` }}
                />
              </View>
              <View className="flex-row items-center justify-between border-t border-white/10 pt-3">
                <Text className="text-sm text-gold">Reservas a aguardar pagamento</Text>
                <Text className="text-sm font-black text-gold">{occupancy?.pendingPayment ?? 0}</Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-white/60">Chegadas previstas hoje</Text>
                <Text className="text-sm font-black text-white">{occupancy?.expectedArrivals ?? 0}</Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-white/60">Estadias em curso</Text>
                <Text className="text-sm font-black text-white">{occupancy?.expectedDepartures ?? 0}</Text>
              </View>
            </Card>
          </View>

          {/* 3. Bar / snack-bar */}
          <View className="gap-3">
            <Text className="text-xs font-black uppercase tracking-wider text-white/45">
              Bar e snack-bar · 30 dias
            </Text>
            {top.length === 0 ? (
              <EmptyState title="Sem vendas registadas" hint="O POS alimenta este painel assim que houver liquidações." />
            ) : (
              <Card className="gap-4">
                {top.map(product => (
                  <Bar
                    key={product.product_name}
                    label={`${product.product_name} (${product.quantity})`}
                    rawValue={product.total}
                    value={formatKz(product.total)}
                    max={top[0]?.total ?? 1}
                    tone="gold"
                  />
                ))}
              </Card>
            )}
            <Button label="Ver detalhe por mesa e por quarto" onPress={() => router.push('/vendas')} />
          </View>

          {/* 4. Economato */}
          <View className="gap-3">
            <Text className="text-xs font-black uppercase tracking-wider text-white/45">Economato</Text>
            {alerts.length === 0 ? (
              <Card>
                <Text className="text-sm text-emerald-300">Nenhum artigo no limite mínimo ou em rutura.</Text>
              </Card>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {alerts.slice(0, 6).map(alert => (
                  <View
                    key={alert.id}
                    className={`rounded-2xl border px-3 py-2 ${
                      alert.state === 'RUTURA'
                        ? 'border-rose-400/30 bg-rose-500/10'
                        : 'border-amber-400/30 bg-amber-500/10'
                    }`}
                  >
                    <Text className="text-[10px] font-black uppercase text-white/70">{alert.name}</Text>
                    <Text
                      className={`text-xs font-black ${
                        alert.state === 'RUTURA' ? 'text-rose-300' : 'text-amber-300'
                      }`}
                    >
                      {alert.current_stock} / {alert.min_stock} {alert.unit}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Button label="Ver stock e histórico" onPress={() => router.push('/economato')} />
          </View>
        </>
      )}
    </Screen>
  );
}

/**
 * Entrada da app de gestão.
 *
 * Sem registo: as contas são criadas por convite. Um perfil que não seja
 * executivo ou administrador é expulso da sessão, não só escondido.
 */
function SignIn() {
  const { signIn, signingIn, error, email, setEmail, password, setPassword } = useExecutive();

  return (
    <ScrollView
      className="flex-1 bg-ocean-dark"
      contentContainerClassName="flex-1 justify-center gap-4 p-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="items-center gap-2 pb-2">
        <Text className="text-3xl font-black text-white">Hotel Lukweku</Text>
        <Text className="text-xs font-black uppercase tracking-[0.3em] text-gold">Gestão</Text>
      </View>

      {error ? <Banner tone="error" message={error} /> : null}

      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="dono@hotellukweku.ao"
        keyboardType="email-address"
      />
      <Field label="Palavra-passe" value={password} onChangeText={setPassword} placeholder="••••••••" />

      {signingIn ? <Loading label="A autenticar…" /> : <Button label="Entrar" variant="primary" onPress={() => void signIn()} />}

      <Text className="text-center text-[11px] text-white/30 leading-relaxed">
        Exclusiva de proprietários e gerência. A app é de leitura: nenhuma acção altera dados do
        hotel.
      </Text>
    </ScrollView>
  );
}
