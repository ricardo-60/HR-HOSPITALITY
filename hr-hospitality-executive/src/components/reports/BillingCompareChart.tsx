import { ScrollView, Text, View } from 'react-native';

import { columnWidth, labelEvery } from '@/components/reports/FlowChart';
import type { BillingComparePoint } from '@/types/executive';

/**
 * Comparação diária da facturação de quartos: sessões horárias (aqua) ao
 * lado das diárias (dourado), em barras agrupadas por dia.
 *
 * Tal como o `FlowChart`, é feito com Views puras — a app não tem
 * `react-native-svg` e não precisa de mais uma dependência para duas
 * barras por dia. Os valores são normalizados pelo máximo da janela, com
 * mínimo de 3% para um dia com pouco movimento continuar visível.
 */
export function BillingCompareChart({ series }: { series: BillingComparePoint[] }) {
  const width = columnWidth(series.length);
  const every = labelEvery(series.length);
  const max = Math.max(...series.flatMap(day => [day.horas, day.diarias]), 1);

  const heightFor = (value: number) => (value > 0 ? Math.max(3, (value / max) * 100) : 0);

  return (
    <View>
      <View className="flex-row items-center gap-4 pb-1">
        <View className="flex-row items-center gap-1.5">
          <View className="h-2.5 w-2.5 rounded-full bg-aqua" />
          <Text className="text-[10px] font-black uppercase tracking-wider text-white/50">Horas</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-2.5 w-2.5 rounded-full bg-gold" />
          <Text className="text-[10px] font-black uppercase tracking-wider text-white/50">Diárias</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row items-end" style={{ height: 128 }}>
          {series.map((day, index) => (
            <View key={day.date} style={{ width }} className="h-full items-center justify-end">
              <View className="flex w-full flex-1 flex-row items-end justify-center gap-0.5">
                <View className="w-1/2 rounded-t-sm bg-aqua" style={{ height: `${heightFor(day.horas)}%` }} />
                <View className="w-1/2 rounded-t-sm bg-gold" style={{ height: `${heightFor(day.diarias)}%` }} />
              </View>
              {index % every === 0 ? (
                <Text className="pt-1 text-[8px] font-bold text-white/35">{day.date.slice(8)}</Text>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
