import { useRouter } from 'expo-router';
import { RefreshControl, Text, View } from 'react-native';

import { PoolCard } from '@/components/booking/pool-card';
import { EmptyState, Loading, OfflineBanner, Screen, SectionHeader } from '@/components/ui';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { fetchPools } from '@/lib/queries';
import { makeDraft, useBooking } from '@/providers/BookingProvider';
import type { PoolPrice } from '@/types/hotel';

export default function PoolsScreen() {
  const router = useRouter();
  const { beginDraft } = useBooking();
  const query = useCachedQuery(fetchPools, 'pools');

  const pools = query.data ?? [];

  const book = (poolName: string, price: PoolPrice) => {
    beginDraft(
      makeDraft('piscina', `${poolName} — ${price.label}`, price.price, 1),
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
        <Text className="text-2xl font-black text-white">Piscinas</Text>
        <Text className="text-sm text-white/50">
          Preços por pessoa. As tabelas ficam guardadas no dispositivo para consulta offline.
        </Text>
      </View>

      <OfflineBanner cachedLabel={query.cachedLabel} error={query.error} onRetry={query.refresh} />

      {query.loading && !query.data ? (
        <Loading label="A carregar os preçários…" />
      ) : (
        <>
          <SectionHeader title="Piscina Inferior e Superior" subtitle={`${pools.length} instalações`} />
          <View className="gap-4">
            {pools.length === 0 ? (
              <EmptyState
                title="Preçários indisponíveis"
                hint="Sem ligação e sem cache guardado. Tente novamente quando houver rede."
              />
            ) : (
              pools.map(pool => (
                <PoolCard
                  key={pool.id}
                  pool={pool}
                  onBook={price => book(pool.name, price)}
                />
              ))
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
