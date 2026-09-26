import { Link, useRouter } from 'expo-router';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { LaundryCard } from '@/components/booking/service-cards';
import { Card, EmptyState, Loading, OfflineBanner, Screen, SectionHeader } from '@/components/ui';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { fetchLaundry } from '@/lib/queries';
import { makeDraft, useBooking } from '@/providers/BookingProvider';
import type { LaundryService } from '@/types/hotel';

export default function ServicesScreen() {
  const router = useRouter();
  const { beginDraft } = useBooking();
  const query = useCachedQuery(fetchLaundry, 'laundry');

  const services = query.data ?? [];

  const book = (service: LaundryService) => {
    beginDraft(
      makeDraft('lavandaria', `Lavandaria — ${service.name}`, service.price, 1),
    );
    router.push('/checkout');
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={query.loading} onRefresh={query.refresh} tintColor="#FBBF24" />
      }
    >
      <View className="gap-1">
        <Text className="text-2xl font-black text-white">Serviços</Text>
        <Text className="text-sm text-white/50">Lavandaria, eventos e apoio à estadia.</Text>
      </View>

      <Link href="/eventos" asChild>
        <Pressable accessibilityRole="button" className="active:opacity-80">
          <Card className="flex-row items-center gap-4">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-aqua/10">
              <Text className="text-lg text-aqua">◈</Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-white">Salões de eventos</Text>
              <Text className="text-xs text-white/50">Reservar conference rooms e espaços</Text>
            </View>
          </Card>
        </Pressable>
      </Link>

      <OfflineBanner cachedLabel={query.cachedLabel} error={query.error} onRetry={query.refresh} />

      {query.loading && !query.data ? (
        <Loading label="A carregar os serviços…" />
      ) : (
        <>
          <SectionHeader title="Lavandaria" subtitle={`${services.length} serviços`} />
          <View className="gap-3">
            {services.length === 0 ? (
              <EmptyState
                title="Serviços indisponíveis"
                hint="Sem ligação e sem cache guardado. Tente novamente quando houver rede."
              />
            ) : (
              services.map(service => (
                <LaundryCard key={service.id} service={service} onBook={book} />
              ))
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
