import { Text, View } from 'react-native';

import { Bar, Card, EmptyState, Loading, Refresh, Screen } from '@/components/ui';
import { formatKz } from '@/lib/format';
import { loadSalesBreakdown, type Result } from '@/lib/executiveApi';
import { useEffect, useState } from 'react';
import type { SalesBreakdown } from '@/types/executive';

/** Faturação do dia por mesa e por quarto. Leitura pura. */
export default function SalesScreen() {
  const [data, setData] = useState<SalesBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const result: Result<SalesBreakdown> = await loadSalesBreakdown();
    if (result.ok) {
      setData(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
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

  if (loading && !data) {
    return (
      <Screen>
        <Loading label="A consolidar as vendas de hoje…" />
      </Screen>
    );
  }

  const maxTable = Math.max(...(data?.byTable.map(row => row.total) ?? [1]), 1);
  const maxRoom = Math.max(...(data?.byRoom.map(row => row.total) ?? [1]), 1);
  const tableTotal = data?.byTable.reduce((sum, row) => sum + row.total, 0) ?? 0;
  const roomTotal = data?.byRoom.reduce((sum, row) => sum + row.total, 0) ?? 0;

  return (
    <Screen refreshControl={<Refresh refreshing={loading} onRefresh={() => void load()} />}>
      {error ? (
        <Card>
          <Text className="text-sm text-rose-200">{error}</Text>
        </Card>
      ) : null}

      <View className="gap-3">
        <Text className="text-xs font-black uppercase tracking-wider text-white/45">Por mesa</Text>
        {data && data.byTable.length > 0 ? (
          <Card className="gap-4">
            {data.byTable.map(row => (
              <Bar key={row.name} label={row.name} rawValue={row.total} value={formatKz(row.total)} max={maxTable} tone="gold" />
            ))}
            <View className="flex-row items-center justify-between border-t border-white/10 pt-3">
              <Text className="text-sm font-black text-white">Total</Text>
              <Text className="text-lg font-black text-gold">{formatKz(tableTotal)}</Text>
            </View>
          </Card>
        ) : (
          <EmptyState title="Sem vendas por mesa hoje" />
        )}
      </View>

      <View className="gap-3">
        <Text className="text-xs font-black uppercase tracking-wider text-white/45">
          Lançado na conta do quarto
        </Text>
        {data && data.byRoom.length > 0 ? (
          <Card className="gap-4">
            {data.byRoom.map(row => (
              <Bar
                key={row.room_number ?? 'sem-quarto'}
                label={`Quarto ${row.room_number ?? '—'}`}
                rawValue={row.total}
                value={formatKz(row.total)}
                max={maxRoom}
                tone="aqua"
              />
            ))}
            <View className="flex-row items-center justify-between border-t border-white/10 pt-3">
              <Text className="text-sm font-black text-white">Total</Text>
              <Text className="text-lg font-black text-aqua">{formatKz(roomTotal)}</Text>
            </View>
          </Card>
        ) : (
          <EmptyState title="Sem consumo lançado em contas de quarto" />
        )}
      </View>

      <Card className="gap-2">
        <Text className="text-[10px] font-black uppercase tracking-wider text-white/40">Como ler isto</Text>
        <Text className="text-sm text-white/60 leading-relaxed">
          O total por mesa é consumo de mesas e balcão. O total por quarto é o que os hóspedes
          lançaram na conta e que só é recebido no checkout geral — por isso entra na receita com
          a reserva, não na data da venda.
        </Text>
      </Card>
    </Screen>
  );
}
