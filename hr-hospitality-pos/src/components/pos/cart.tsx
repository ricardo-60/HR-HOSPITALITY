import { Pressable, Text, View } from 'react-native';

import { formatKz } from '@/lib/format';
import type { PosOrderItem } from '@/types/pos';

export function CartRow({
  item,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  item: PosOrderItem;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onRemove?: () => void;
}) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-white/10 bg-ink-soft px-4 py-3">
      <View className="flex-1">
        <Text className="text-sm font-bold text-white" numberOfLines={1}>{item.product_name}</Text>
        <Text className="text-[11px] text-white/40 mt-0.5">
          {formatKz(item.unit_price)} × {item.quantity}
        </Text>
      </View>

      {onIncrement || onDecrement ? (
        <View className="flex-row items-center gap-1">
          {onDecrement ? (
            <Pressable
              onPress={onDecrement}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Diminuir ${item.product_name}`}
              className="h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 active:bg-white/10"
            >
              <Text className="text-lg font-black text-white">−</Text>
            </Pressable>
          ) : null}
          <Text className="min-w-[34px] text-center text-base font-black text-white">{item.quantity}</Text>
          {onIncrement ? (
            <Pressable
              onPress={onIncrement}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Aumentar ${item.product_name}`}
              className="h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 active:bg-white/10"
            >
              <Text className="text-lg font-black text-white">+</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Text className="min-w-[92px] text-right text-sm font-black text-gold">{formatKz(item.line_total)}</Text>

      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remover ${item.product_name}`}
          className="h-11 w-11 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/10 active:bg-rose-500/20"
        >
          <Text className="text-sm font-black text-rose-300">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TotalBar({
  subtotal,
  discount,
  total,
  serviceLabel,
}: {
  subtotal: number;
  discount: number;
  total: number;
  serviceLabel?: string;
}) {
  return (
    <View className="rounded-3xl border border-gold/30 bg-gold/10 p-5 gap-1.5">
      {serviceLabel ? <Text className="text-[11px] font-black uppercase tracking-wider text-gold">{serviceLabel}</Text> : null}
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-white/55">Subtotal</Text>
        <Text className="text-sm font-semibold text-white/80">{formatKz(subtotal)}</Text>
      </View>
      {discount > 0 ? (
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-white/55">Desconto</Text>
          <Text className="text-sm font-semibold text-emerald-300">− {formatKz(discount)}</Text>
        </View>
      ) : null}
      <View className="mt-1 flex-row items-center justify-between border-t border-gold/20 pt-2">
        <Text className="text-base font-black text-white">Total</Text>
        <Text className="text-3xl font-black text-gold">{formatKz(total)}</Text>
      </View>
    </View>
  );
}
