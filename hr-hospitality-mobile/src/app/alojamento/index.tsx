import { useRouter } from 'expo-router';
import { RefreshControl, Text, View } from 'react-native';

import { RoomCard } from '@/components/booking/room-card';
import { EmptyState, Loading, OfflineBanner, Screen, SectionHeader } from '@/components/ui';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { fetchRooms } from '@/lib/queries';

export default function RoomsScreen() {
  const router = useRouter();
  const query = useCachedQuery(fetchRooms, 'rooms');

  const rooms = query.data ?? [];

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={query.loading} onRefresh={query.refresh} tintColor="#FBBF24" />
      }
    >
      <View className="gap-1">
        <Text className="text-2xl font-black text-white">Alojamento</Text>
        <Text className="text-sm text-white/50">
          Quartos disponíveis para reserva. Os preços estão em Kwanzas.
        </Text>
      </View>

      <OfflineBanner cachedLabel={query.cachedLabel} error={query.error} onRetry={query.refresh} />

      {query.loading && !query.data ? (
        <Loading label="A consultar disponibilidade…" />
      ) : (
        <>
          <SectionHeader
            title="Quartos disponíveis"
            subtitle={`${rooms.length} ${rooms.length === 1 ? 'opção' : 'opções'}`}
          />
          <View className="gap-3">
            {rooms.length === 0 ? (
              <EmptyState
                title="Sem quartos disponíveis"
                hint="Não há quartos livres no momento. Tente novamente mais tarde."
              />
            ) : (
              rooms.map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onSelect={() => router.push({ pathname: '/alojamento/[roomId]', params: { roomId: room.id } })}
                />
              ))
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
