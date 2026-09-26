import { Pressable, Text, View } from 'react-native';

import { Badge, Card } from '@/components/ui';
import { ROOM_STATUS_LABEL, formatKzShort } from '@/lib/format';
import type { HotelRoom } from '@/types/hotel';

type BadgeTone = 'success' | 'warning' | 'muted' | 'accent' | 'danger';

const TYPE_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  Standard: { label: 'Standard', tone: 'muted' },
  Double: { label: 'Double', tone: 'accent' },
  Suite: { label: 'Suite', tone: 'success' },
  'Suite Premium': { label: 'Suite Premium', tone: 'warning' },
};

export function RoomCard({
  room,
  onSelect,
}: {
  room: HotelRoom;
  onSelect?: (room: HotelRoom) => void;
}) {
  const meta = TYPE_BADGE[room.room_type] ?? { label: room.room_type, tone: 'muted' as const };

  return (
    <Pressable
      onPress={() => onSelect?.(room)}
      accessibilityRole="button"
      accessibilityLabel={`Quarto ${room.room_number}, ${ROOM_STATUS_LABEL[room.status] ?? room.status}`}
      className={onSelect ? 'active:opacity-80' : undefined}
    >
      <Card className="gap-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-2xl font-black text-white">{room.room_number}</Text>
            <Text className="text-xs uppercase tracking-wider text-white/50">
              {room.room_type} · {room.floor}º piso
            </Text>
          </View>
          <Badge label={meta.label} tone={meta.tone} />
        </View>

        {room.description ? (
          <Text className="text-sm leading-relaxed text-white/65">{room.description}</Text>
        ) : null}

        <View className="mt-1 flex-row items-end justify-between">
          <View>
            <Text className="text-[10px] uppercase tracking-wider text-white/40">Por noite</Text>
            <Text className="text-lg font-black text-gold">{formatKzShort(room.price_per_night)}</Text>
          </View>
          {onSelect ? (
            <View className="rounded-full bg-aqua/15 px-4 py-2">
              <Text className="text-xs font-bold text-aqua">Reservar</Text>
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}
