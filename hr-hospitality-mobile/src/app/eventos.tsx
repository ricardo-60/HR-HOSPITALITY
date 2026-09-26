import { useRouter } from 'expo-router';
import { RefreshControl, Text, View } from 'react-native';

import { EventSpaceCard } from '@/components/booking/service-cards';
import { EmptyState, Loading, OfflineBanner, Screen, SectionHeader } from '@/components/ui';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { fetchEventSpaces } from '@/lib/queries';
import { makeDraft, useBooking } from '@/providers/BookingProvider';

export default function EventsScreen() {
  const router = useRouter();
  const { beginDraft } = useBooking();
  const query = useCachedQuery(fetchEventSpaces, 'events');

  const spaces = query.data ?? [];

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={query.loading} onRefresh={query.refresh} tintColor="#FBBF24" />
      }
    >
      <View className="gap-1">
        <Text className="text-2xl font-black text-white">Salões de eventos</Text>
        <Text className="text-sm text-white/50">
          Conference rooms e espaços para conferências, casamentos e eventos corporativos.
        </Text>
      </View>

      <OfflineBanner cachedLabel={query.cachedLabel} error={query.error} onRetry={query.refresh} />

      {query.loading && !query.data ? (
        <Loading label="A carregar os salões…" />
      ) : (
        <>
          <SectionHeader
            title="Espaços disponíveis"
            subtitle={`${spaces.length} ${spaces.length === 1 ? 'espaço' : 'espaços'}`}
          />
          <View className="gap-3">
            {spaces.length === 0 ? (
              <EmptyState
                title="Sem espaços publicados"
                hint="Os salões ainda não foram cadastrados. Contacte a recepção."
              />
            ) : (
              spaces.map(space => (
                <EventSpaceCard
                  key={space.id}
                  space={space}
                  onBook={() => {
                    beginDraft(
                      makeDraft('evento', `Evento — ${space.name}`, Number(space.price_per_hour), 1),
                    );
                    router.push('/checkout');
                  }}
                />
              ))
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
