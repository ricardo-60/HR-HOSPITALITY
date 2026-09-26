import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { formatKz } from '@/lib/format';
import type { EventSpace, LaundryService } from '@/types/hotel';

export function EventSpaceCard({
  space,
  onBook,
}: {
  space: EventSpace;
  onBook?: (space: EventSpace) => void;
}) {
  return (
    <Pressable
      onPress={() => onBook?.(space)}
      accessibilityRole="button"
      accessibilityLabel={`${space.name}, ${formatKz(space.price_per_hour)} por hora`}
      className={onBook ? 'active:opacity-80' : undefined}
    >
      <Card className="gap-3">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-lg font-bold text-white">{space.name}</Text>
          {space.capacity != null ? (
            <View className="rounded-full border border-white/15 px-3 py-1">
              <Text className="text-[11px] text-white/70">até {space.capacity} pessoas</Text>
            </View>
          ) : null}
        </View>

        {space.description ? (
          <Text className="text-sm leading-relaxed text-white/60">{space.description}</Text>
        ) : null}

        <View className="mt-1 flex-row items-end justify-between">
          <View>
            <Text className="text-[10px] uppercase tracking-wider text-white/40">Por hora</Text>
            <Text className="text-lg font-black text-gold">{formatKz(space.price_per_hour)}</Text>
          </View>
          {space.price_per_day != null ? (
            <View className="items-end">
              <Text className="text-[10px] uppercase tracking-wider text-white/40">Dia inteiro</Text>
              <Text className="text-sm font-bold text-white/80">{formatKz(space.price_per_day)}</Text>
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

export function LaundryCard({
  service,
  onBook,
}: {
  service: LaundryService;
  onBook?: (service: LaundryService) => void;
}) {
  return (
    <Pressable
      onPress={() => onBook?.(service)}
      accessibilityRole="button"
      accessibilityLabel={`${service.name}, ${formatKz(service.price)} por ${service.unit}`}
      className={onBook ? 'active:opacity-80' : undefined}
    >
      <Card className="gap-2">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-bold text-white">{service.name}</Text>
            {service.description ? (
              <Text className="text-xs leading-relaxed text-white/55">{service.description}</Text>
            ) : null}
          </View>
          <View className="items-end">
            <Text className="text-base font-black text-gold">{formatKz(service.price)}</Text>
            <Text className="text-[10px] uppercase tracking-wider text-white/40">{service.unit}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="rounded-full border border-white/15 px-3 py-1">
            <Text className="text-[11px] text-white/70">
              Entrega em {service.turnaround_hours} h
            </Text>
          </View>
          {onBook ? (
            <View className="rounded-full bg-aqua/15 px-3 py-1">
              <Text className="text-[11px] font-bold text-aqua">Pedir</Text>
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}
