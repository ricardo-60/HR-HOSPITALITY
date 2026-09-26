import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, Field, Loading, Screen, SectionHeader } from '@/components/ui';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { addDaysIso, formatDay, formatKz, todayIso } from '@/lib/format';
import { fetchRooms } from '@/lib/queries';
import { makeDraft, useBooking } from '@/providers/BookingProvider';

export default function RoomDetailScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const { beginDraft } = useBooking();

  const [nights, setNights] = useState('1');
  const [checkIn, setCheckIn] = useState(todayIso());

  const query = useCachedQuery(fetchRooms, 'rooms');
  const room = useMemo(
    () => (query.data ?? []).find(item => item.id === roomId),
    [query.data, roomId],
  );

  if (query.loading && !query.data) {
    return (
      <Screen>
        <Loading label="A carregar o quarto…" />
      </Screen>
    );
  }

  if (!room) {
    return (
      <Screen>
        <EmptyState
          title="Quarto indisponível"
          hint="Este quarto deixou de estar disponível. Escolha outro na lista."
        />
      </Screen>
    );
  }

  const nightsSafe = Math.max(1, Math.min(30, Number.parseInt(nights, 10) || 1));
  const checkOut = addDaysIso(checkIn, nightsSafe);
  const unitPrice = Number(room.price_per_night) || 0;
  const total = Math.round(unitPrice * nightsSafe * 100) / 100;

  const proceed = () => {
    beginDraft({
      ...makeDraft('quarto', `Quarto ${room.room_number} — ${room.room_type}`, unitPrice, nightsSafe, checkIn),
      detail: { checkOut, roomId: room.id, roomNumber: room.room_number },
    });
    router.push('/checkout');
  };

  return (
    <Screen>
      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-3xl font-black text-white">{room.room_number}</Text>
          <Badge label={room.room_type} tone="accent" />
        </View>
        {room.description ? (
          <Text className="text-sm leading-relaxed text-white/60">{room.description}</Text>
        ) : null}
      </View>

      <Card className="gap-1">
        <Text className="text-[11px] uppercase tracking-wider text-white/45">Tarifa</Text>
        <Text className="text-2xl font-black text-gold">{formatKz(unitPrice)}</Text>
        <Text className="text-xs text-white/50">por noite, {room.floor}º piso</Text>
      </Card>

      <View className="gap-3">
        <SectionHeader title="Estadia" />
        <Field
          label="Data de chegada"
          value={checkIn}
          onChangeText={setCheckIn}
          placeholder="AAAA-MM-DD"
          autoCapitalize="none"
        />
        <Field
          label="Noites"
          value={nights}
          onChangeText={setNights}
          keyboardType="numeric"
          autoCapitalize="none"
        />
      </View>

      <Card className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-white/60">Saída prevista</Text>
          <Text className="text-sm font-semibold text-white">{formatDay(checkOut)}</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-white/60">
            {nightsSafe} {nightsSafe === 1 ? 'noite' : 'noites'}
          </Text>
          <Text className="text-sm font-semibold text-white">{formatKz(unitPrice)} / noite</Text>
        </View>
        <View className="mt-1 flex-row items-center justify-between border-t border-white/10 pt-3">
          <Text className="text-sm font-bold text-white">Total</Text>
          <Text className="text-xl font-black text-gold">{formatKz(total)}</Text>
        </View>
      </Card>

      <Button label="Continuar para pagamento" onPress={proceed} />
    </Screen>
  );
}
