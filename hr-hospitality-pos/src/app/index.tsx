import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { TableTile } from '@/components/pos/tiles';
import { Banner, Button, Card, EmptyState, Field, Header, Loading } from '@/components/ui';
import { formatKz, formatTime } from '@/lib/format';
import { listOpenOrders, listTables, openOrder, type Result } from '@/lib/posApi';
import { usePOS } from '@/providers/POSProvider';
import type { PosOrder, PosTable } from '@/types/pos';

/**
 * Ecrã principal do POS: mapa de mesas e comandas abertas.
 *
 * A venda avulsa fica no topo porque é a decisão mais frequente do operador e
 * não exige mesa. Por baixo, as mesas agrupadas por zona, e no fim as comandas
 * em curso — que podem ser de qualquer zona.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { session, profile, canOperate, signOut } = usePOS();

  const [tables, setTables] = useState<PosTable[]>([]);
  const [orders, setOrders] = useState<PosOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');

  useEffect(() => {
    if (session !== 'ready') return;
    let cancelled = false;
    // Carregamento diferido: o estado inicial é a lista vazia, idêntica no
    // servidor e no cliente, e evita `setState` síncrono dentro do efeito.
    const timer = setTimeout(() => {
      void (async () => {
        const [tableResult, orderResult] = await Promise.all([listTables(), listOpenOrders()]);
        if (cancelled) return;
        if (!tableResult.ok) setError(tableResult.error);
        else setTables(tableResult.data);
        if (orderResult.ok) setOrders(orderResult.data);
        setLoading(false);
      })();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session]);

  const refresh = async () => {
    setLoading(true);
    const [tableResult, orderResult] = await Promise.all([listTables(), listOpenOrders()]);
    if (!tableResult.ok) setError(tableResult.error);
    else setTables(tableResult.data);
    if (orderResult.ok) setOrders(orderResult.data);
    setLoading(false);
  };

  const startOrder = async (table: PosTable | null) => {
    setBusy(true);
    setError(null);
    const result: Result<PosOrder> = await openOrder({
      tableId: table?.id ?? null,
      reservationId: null,
      customerName: table ? '' : customerName.trim(),
      guestCount: table?.seats ?? 1,
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setCustomerName('');
    router.push({ pathname: '/comanda/[orderId]', params: { orderId: result.data.id } });
  };

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

  if (!canOperate) {
    return (
      <ScrollView className="flex-1 bg-ocean-dark" contentContainerClassName="p-6 gap-4">
        <Header title="Sem permissão de operação" subtitle={profile.name} />
        <Banner tone="info" message="Este perfil é de gestão. Não abre comandas nem altera mesas." />
        <Button label="Terminar sessão" variant="secondary" onPress={() => void signOut()} />
      </ScrollView>
    );
  }

  const grouped = tables.reduce<Record<string, PosTable[]>>((groups, table) => {
    (groups[table.zone] ??= []).push(table);
    return groups;
  }, {});

  return (
    <ScrollView
      className="flex-1 bg-ocean-dark"
      contentContainerClassName="gap-5 p-4 pb-24"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor="#FBBF24" />}
    >
      <Header
        title="Ponto de venda"
        subtitle={`${profile.name} · operador`}
        right={<Button label="Sair" variant="secondary" compact onPress={() => void signOut()} />}
      />

      {error ? <Banner tone="error" message={error} onClose={() => setError(null)} /> : null}

      <Card className="gap-3">
        <Text className="text-xs font-black uppercase tracking-wider text-white/45">
          Venda avulsa · sem mesa
        </Text>
        <View className="flex-row items-end gap-3">
          <View className="flex-1">
            <Field
              label="Nome do cliente (opcional)"
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Cliente externo"
              autoCapitalize="words"
            />
          </View>
          <Button label="Abrir" loading={busy} onPress={() => void startOrder(null)} />
        </View>
      </Card>

      <View className="gap-3">
        <Text className="text-xs font-black uppercase tracking-wider text-white/45">Mesas por zona</Text>
        {loading ? (
          <Loading label="A carregar as mesas…" />
        ) : tables.length === 0 ? (
          <EmptyState
            title="Sem mesas registadas"
            hint="Cadastre as mesas no painel administrativo para começar a vender."
          />
        ) : (
          Object.entries(grouped).map(([zone, group]) => (
            <View key={zone} className="gap-2">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-white/35">{zone}</Text>
              <View className="flex-row flex-wrap gap-3">
                {group.map(table => (
                  <TableTile
                    key={table.id}
                    table={table}
                    onPress={table.status === 'MANUTENCAO' ? undefined : () => void startOrder(table)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </View>

      <View className="gap-3">
        <Text className="text-xs font-black uppercase tracking-wider text-white/45">
          Comandas abertas ({orders.length})
        </Text>
        {orders.length === 0 ? (
          <EmptyState title="Nenhuma comanda aberta" hint="Toque numa mesa para começar." />
        ) : (
          <View className="gap-2">
            {orders.map(order => (
              <Button
                key={order.id}
                label={`${order.order_number} · ${order.table_name ?? 'Avulsa'} · ${formatTime(order.opened_at)} · ${formatKz(order.total)}`}
                variant="secondary"
                onPress={() => router.push({ pathname: '/comanda/[orderId]', params: { orderId: order.id } })}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/**
 * Início de sessão do operador.
 *
 * Sem link para registo: as contas são criadas por convite na plataforma. A RLS
 * devolve o perfil do próprio operador, e a sessão é fechada se esse perfil não
 * existir ou estiver bloqueado.
 */
function SignIn() {
  const { signIn, signingIn, error, email, setEmail, password, setPassword } = usePOS();

  return (
    <ScrollView
      className="flex-1 bg-ocean-dark"
      contentContainerClassName="flex-1 justify-center gap-4 p-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="items-center gap-2 pb-2">
        <Text className="text-3xl font-black text-white">Hotel Lukweku</Text>
        <Text className="text-xs font-black uppercase tracking-[0.3em] text-gold">Ponto de venda</Text>
      </View>

      {error ? <Banner tone="error" message={error} /> : null}

      <Field
        label="Email do operador"
        value={email}
        onChangeText={setEmail}
        placeholder="operador@hotellukweku.ao"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Field
        label="Palavra-passe"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        autoCapitalize="none"
      />

      <Button label="Entrar" loading={signingIn} onPress={() => void signIn()} />

      <Text className="text-center text-[11px] text-white/30 leading-relaxed">
        Contas criadas por convite. Um operador só vê o hotel a que pertence.
      </Text>
    </ScrollView>
  );
}
