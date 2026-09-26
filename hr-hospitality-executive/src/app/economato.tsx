import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Card, EmptyState, Loading, Refresh, Screen } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { loadStockAlerts, loadStockMovements, type Result } from '@/lib/executiveApi';
import { MOVEMENT_LABEL, MOVEMENT_SIGN, type StockAlert, type StockMovementRow } from '@/types/executive';

/** Estado do stock, alertas e histórico recente. Leitura pura. */
export default function InventoryScreen() {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [alertResult, movementResult]: [Result<StockAlert[]>, Result<StockMovementRow[]>] =
      await Promise.all([loadStockAlerts(), loadStockMovements()]);

    if (alertResult.ok) setAlerts(alertResult.data);
    if (movementResult.ok) setMovements(movementResult.data);
    const failure = [alertResult, movementResult].find(r => !r.ok);
    setError(failure && !failure.ok ? failure.error : null);
    setLoading(false);
  };

  useEffect(() => {
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
  }, []);

  if (loading && alerts.length === 0 && movements.length === 0) {
    return (
      <Screen>
        <Loading label="A carregar o economato…" />
      </Screen>
    );
  }

  const out = alerts.filter(alert => alert.state === 'RUTURA');
  const low = alerts.filter(alert => alert.state === 'BAIXO');

  return (
    <Screen refreshControl={<Refresh refreshing={loading} onRefresh={() => void load()} />}>
      {error ? (
        <Card>
          <Text className="text-sm text-rose-200">{error}</Text>
        </Card>
      ) : null}

      <View className="gap-3">
        <Text className="text-xs font-black uppercase tracking-wider text-white/45">Alertas de reposição</Text>
        {alerts.length === 0 ? (
          <Card>
            <Text className="text-sm text-emerald-300">Nenhum artigo abaixo do mínimo.</Text>
          </Card>
        ) : (
          <>
            {out.length > 0 ? (
              <View className="gap-2">
                <Text className="text-[11px] font-black uppercase text-rose-300">Em rutura ({out.length})</Text>
                <View className="flex-row flex-wrap gap-2">
                  {out.map(alert => (
                    <View key={alert.id} className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2">
                      <Text className="text-[10px] font-black uppercase text-white/70">{alert.name}</Text>
                      <Text className="text-xs font-black text-rose-300">
                        {alert.current_stock} {alert.unit} · mín. {alert.min_stock}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {low.length > 0 ? (
              <View className="gap-2">
                <Text className="text-[11px] font-black uppercase text-amber-300">No limite ({low.length})</Text>
                <View className="flex-row flex-wrap gap-2">
                  {low.map(alert => (
                    <View key={alert.id} className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                      <Text className="text-[10px] font-black uppercase text-white/70">{alert.name}</Text>
                      <Text className="text-xs font-black text-amber-300">
                        {alert.current_stock} {alert.unit} · mín. {alert.min_stock}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>

      <View className="gap-3">
        <Text className="text-xs font-black uppercase tracking-wider text-white/45">
          Histórico recente
        </Text>
        {movements.length === 0 ? (
          <EmptyState title="Sem movimentos registados" />
        ) : (
          <Card className="divide-y divide-white/5">
            {movements.map(row => (
              <View key={row.id} className="flex-row items-center gap-3 py-3">
                <View
                  className={`min-w-[64px] items-center rounded-xl border px-2 py-1 ${
                    row.movement_type === 'ENTRADA'
                      ? 'border-emerald-400/30 bg-emerald-500/10'
                      : row.movement_type === 'QUEBRA'
                        ? 'border-rose-400/30 bg-rose-500/10'
                        : 'border-white/15 bg-white/5'
                  }`}
                >
                  <Text className="text-[9px] font-black uppercase text-white/50">
                    {MOVEMENT_LABEL[row.movement_type]}
                  </Text>
                  <Text
                    className={`text-sm font-black ${
                      row.movement_type === 'ENTRADA'
                        ? 'text-emerald-300'
                        : row.movement_type === 'QUEBRA'
                          ? 'text-rose-300'
                          : 'text-white/70'
                    }`}
                  >
                    {MOVEMENT_SIGN[row.movement_type]}
                    {row.quantity}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-white/80" numberOfLines={1}>{row.item_name}</Text>
                  {row.reason ? <Text className="text-[11px] text-white/35" numberOfLines={1}>{row.reason}</Text> : null}
                </View>
                {row.balance_after !== null ? (
                  <Text className="text-[11px] font-black text-white/45">saldo {row.balance_after}</Text>
                ) : null}
                <Text className="text-[10px] text-white/25">{formatDateTime(row.created_at)}</Text>
              </View>
            ))}
          </Card>
        )}
      </View>

      <Card className="gap-2">
        <Text className="text-[10px] font-black uppercase tracking-wider text-white/40">Rastreabilidade</Text>
        <Text className="text-sm text-white/60 leading-relaxed">
          Cada entrada, saída, quebra ou inventário escreve uma linha de histórico e um trigger
          recalcula o saldo. O valor em stock nunca é escrito à mão, e o POS consome do mesmo
          economato — o que o bar vende é o que sai do armazém.
        </Text>
      </Card>
    </Screen>
  );
}
