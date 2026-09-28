import { Text, View } from 'react-native';

import { formatKz } from '@/lib/format';
import type { TopSeller } from '@/types/executive';

/**
 * Ranking de mais vendidos: posição, nome, receita e, por baixo, a barra
 * de proporção face ao topo da lista com as unidades vendidas.
 *
 * Views puras, no mesmo vocabulário visual do `Bar` do kit de UI — a app
 * não usa bibliotecas de gráficos.
 */
export function RankList({ items, tone = 'gold' }: { items: TopSeller[]; tone?: 'gold' | 'aqua' }) {
  const max = Math.max(...items.map(item => item.revenue), 1);
  const barClass = tone === 'aqua' ? 'bg-aqua' : 'bg-gold';
  const valueClass = tone === 'aqua' ? 'text-aqua' : 'text-gold';

  return (
    <View className="gap-3">
      {items.map((item, index) => {
        const ratio = Math.max(0.04, Math.min(1, item.revenue / max));
        return (
          <View key={item.name} className="gap-1.5">
            <View className="flex-row items-center gap-2">
              <View className="h-5 w-5 items-center justify-center rounded-full bg-white/10">
                <Text className="text-[10px] font-black text-white/70">{index + 1}</Text>
              </View>
              <Text className="flex-1 text-sm font-semibold text-white/75" numberOfLines={1}>
                {item.name}
              </Text>
              <Text className={`text-sm font-black ${valueClass}`}>{formatKz(item.revenue)}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <View className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                <View className={`h-full rounded-full ${barClass}`} style={{ width: `${ratio * 100}%` }} />
              </View>
              <Text className="text-[10px] font-black uppercase tracking-wider text-white/45">{item.units} un</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
