import { useRouter } from 'expo-router';
import { RefreshControl, Text, View } from 'react-native';

import { LaundryCard } from '@/components/booking/service-cards';
import { Card, EmptyState, Loading, OfflineBanner, Screen, SectionHeader } from '@/components/ui';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { fetchLaundry } from '@/lib/queries';
import { makeDraft, useBooking } from '@/providers/BookingProvider';

export default function LaundryScreen() {
  const router = useRouter();
  const { beginDraft } = useBooking();
  const query = useCachedQuery(fetchLaundry, 'laundry');

  const services = query.data ?? [];

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={query.loading} onRefresh={query.refresh} tintColor="#FBBF24" />
      }
    >
      <View className="gap-1">
        <Text className="text-2xl font-black text-white">Lavandaria</Text>
        <Text className="text-sm text-white/50">
          Entrega no quarto. O prazo indica quando a peça está pronta.
        </Text>
      </View>

      <Card className="gap-1 border-white/10 bg-ocean/40">
        <Text className="text-xs font-bold uppercase tracking-wider text-white/45">Como funciona</Text>
        <Text className="text-sm leading-relaxed text-white/65">
          1. Escolha o serviço e confirme a reserva. 2. Entregue a roupa na recepção. 3. Receba o
          comprovativo e pague por transferência. 4. A lavandaria entrega no quarto.
        </Text>
      </Card>

      <OfflineBanner cachedLabel={query.cachedLabel} error={query.error} onRetry={query.refresh} />

      {query.loading && !query.data ? (
        <Loading label="A carregar os serviços…" />
      ) : (
        <>
          <SectionHeader
            title="Serviços"
            subtitle={`${services.length} ${services.length === 1 ? 'opção' : 'opções'}`}
          />
          <View className="gap-3">
            {services.length === 0 ? (
              <EmptyState
                title="Serviços indisponíveis"
                hint="Sem ligação e sem cache guardado. Tente novamente quando houver rede."
              />
            ) : (
              services.map(service => (
                <LaundryCard
                  key={service.id}
                  service={service}
                  onBook={() => {
                    beginDraft(
                      makeDraft('lavandaria', `Lavandaria — ${service.name}`, Number(service.price), 1),
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
