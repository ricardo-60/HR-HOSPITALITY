import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { FALLBACK_POOL_PRICES } from '@/constants/hotel';
import { formatKz } from '@/lib/format';
import type { Pool, PoolPrice } from '@/types/hotel';

function poolPrices(pool: Pool): PoolPrice[] {
  if (pool.prices?.length) return pool.prices;
  // Sem rede e sem cache: o preçário ilustrativo garante que o ecrã não fica vazio.
  const fallback = FALLBACK_POOL_PRICES[pool.slug] ?? [];
  return fallback.map((row, index) => ({
    id: `local-${pool.slug}-${index}`,
    pool_id: pool.id,
    label: row.label,
    price: row.price,
    unit: row.unit,
    sort_order: index,
  }));
}

export function PoolCard({ pool, onBook }: { pool: Pool; onBook?: (price: PoolPrice) => void }) {
  const rows = poolPrices(pool);
  const depth =
    pool.depth_min_m != null && pool.depth_max_m != null
      ? `${pool.depth_min_m}–${pool.depth_max_m} m`
      : null;

  return (
    <Card className="gap-4">
      <View className="gap-1">
        <Text className="text-lg font-bold text-white">{pool.name}</Text>
        {pool.description ? (
          <Text className="text-sm leading-relaxed text-white/60">{pool.description}</Text>
        ) : null}
      </View>

      <View className="flex-row flex-wrap gap-2">
        {depth ? (
          <View className="rounded-full border border-white/15 px-3 py-1">
            <Text className="text-[11px] text-white/70">Profundidade {depth}</Text>
          </View>
        ) : null}
        {pool.opening_hours ? (
          <View className="rounded-full border border-white/15 px-3 py-1">
            <Text className="text-[11px] text-white/70">{pool.opening_hours}</Text>
          </View>
        ) : null}
      </View>

      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase tracking-wider text-white/50">
          Tabela de preços
        </Text>
        {rows.length === 0 ? (
          <Text className="text-xs text-white/40">Preços disponíveis na recepção.</Text>
        ) : (
          rows.map(row => (
            <View
              key={row.id}
              className="flex-row items-center justify-between gap-3 rounded-2xl border border-white/10 bg-ocean/40 px-4 py-3"
            >
              <Text className="flex-1 text-sm text-white/80">{row.label}</Text>
              <Text className="text-sm font-bold text-gold">{formatKz(row.price)}</Text>
              {onBook ? (
                <Pressable onPress={() => onBook(row)} hitSlop={8} accessibilityRole="button">
                  <Text className="text-xs font-bold text-aqua">Reservar</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </View>
    </Card>
  );
}
