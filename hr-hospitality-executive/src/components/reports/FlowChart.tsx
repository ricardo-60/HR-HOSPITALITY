import { ScrollView, Text, View } from 'react-native';

import type { DailyFlow } from '@/types/executive';

/** Largura da coluna de um dia, conforme a janela (90 dias cabe no scroll). Exportada para o gráfico de comparação usar a mesma régua. */
export function columnWidth(days: number): number {
  if (days > 60) return 12;
  if (days > 14) return 20;
  return 36;
}

/** Rótulo de dia a mostrar: todos no 7 dias, de 5 em 5 no 30, de 15 em 15 no 90. Exportada para o gráfico de comparação usar a mesma régua. */
export function labelEvery(days: number): number {
  if (days > 60) return 15;
  if (days > 14) return 5;
  return 1;
}

/**
 * Gráfico de barras vertical: receitas (verde) vs despesas (vermelho), por dia.
 *
 * Feito com Views puras — a app não tem `react-native-svg` e não precisa de
 * mais uma dependência para duas barras por dia. Os valores são normalizados
 * pelo máximo da janela, com mínimo de 3% para um dia com pouco movimento
 * continuar visível.
 */
export function FlowChart({ series }: { series: DailyFlow[] }) {
  const width = columnWidth(series.length);
  const every = labelEvery(series.length);
  const max = Math.max(...series.flatMap(day => [day.receita, day.despesa]), 1);

  const heightFor = (value: number) => (value > 0 ? Math.max(3, (value / max) * 100) : 0);

  return (
    <View>
      <View className="flex-row items-center gap-4 pb-1">
        <View className="flex-row items-center gap-1.5">
          <View className="h-2.5 w-2.5 rounded-full bg-inflow" />
          <Text className="text-[10px] font-black uppercase tracking-wider text-white/50">Receitas</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-2.5 w-2.5 rounded-full bg-outflow" />
          <Text className="text-[10px] font-black uppercase tracking-wider text-white/50">Despesas</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row items-end" style={{ height: 128 }}>
          {series.map((day, index) => (
            <View key={day.date} style={{ width }} className="h-full items-center justify-end">
              <View className="flex w-full flex-1 flex-row items-end justify-center gap-0.5">
                <View className="w-1/2 rounded-t-sm bg-inflow" style={{ height: `${heightFor(day.receita)}%` }} />
                <View className="w-1/2 rounded-t-sm bg-outflow" style={{ height: `${heightFor(day.despesa)}%` }} />
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
