import { Link } from 'expo-router';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { Badge, Card, EmptyState, Loading, OfflineBanner, Screen, SectionHeader } from '@/components/ui';
import { HOTEL } from '@/constants/hotel';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { formatKzShort } from '@/lib/format';
import { fetchRooms } from '@/lib/queries';
import { isSupabaseConfigured } from '@/lib/supabase';

const SHORTCUTS = [
  { title: 'Alojamento', hint: 'Escolher quarto', href: '/alojamento', glyph: '▤' },
  { title: 'Eventos', hint: 'Salões e espaços', href: '/eventos', glyph: '◈' },
  { title: 'Piscinas', hint: 'Preços e horários', href: '/piscinas', glyph: '≈' },
  { title: 'Ginásio', hint: 'Diárias e mensalidades', href: '/ginasio', glyph: '◉' },
  { title: 'Lavandaria', hint: 'Serviços e prazos', href: '/lavandaria', glyph: '✦' },
  { title: 'Check-in digital', hint: 'BI, passaporte e selfie', href: '/kyc', glyph: '☰' },
] as const;

export default function HomeScreen() {
  const rooms = useCachedQuery(fetchRooms, 'rooms');

  const available = rooms.data ?? [];
  const cheapest = available.reduce<number | null>((min, room) => {
    const price = Number(room.price_per_night);
    if (!Number.isFinite(price)) return min;
    return min === null || price < min ? price : min;
  }, null);

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={rooms.loading}
          onRefresh={rooms.refresh}
          tintColor="#FBBF24"
        />
      }
    >
      <View className="gap-1">
        <Text className="text-3xl font-black tracking-tight text-white">{HOTEL.name}</Text>
        <Text className="text-sm text-white/50">{HOTEL.tagline}</Text>
      </View>

      {!isSupabaseConfigured ? (
        <Card className="gap-1 border-gold/30 bg-gold/10">
          <Text className="text-xs font-bold uppercase tracking-wider text-gold">Modo demonstração</Text>
          <Text className="text-sm text-white/70">
            Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY para ligar os dados reais.
          </Text>
        </Card>
      ) : null}

      <Card className="gap-2">
        <Text className="text-[11px] uppercase tracking-wider text-white/45">Disponibilidade</Text>
        {rooms.loading && !rooms.data ? (
          <Loading label="A consultar quartos…" />
        ) : (
          <>
            <Text className="text-3xl font-black text-gold">
              {available.length} {available.length === 1 ? 'quarto' : 'quartos'}
            </Text>
            {cheapest !== null ? (
              <Text className="text-sm text-white/60">Desde {formatKzShort(cheapest)} por noite</Text>
            ) : null}
          </>
        )}
      </Card>

      <OfflineBanner cachedLabel={rooms.cachedLabel} error={rooms.error} onRetry={rooms.refresh} />

      <View className="gap-3">
        <SectionHeader title="Reservar" subtitle="Escolha o que pretende" />
        <View className="gap-3">
          {SHORTCUTS.map(item => (
            <Link key={item.href} href={item.href as never} asChild>
              <Pressable accessibilityRole="button" className="active:opacity-80">
                <Card className="flex-row items-center gap-4">
                  <View className="h-11 w-11 items-center justify-center rounded-2xl bg-aqua/10">
                    <Text className="text-lg text-aqua">{item.glyph}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-white">{item.title}</Text>
                    <Text className="text-xs text-white/50">{item.hint}</Text>
                  </View>
                  <Badge label="›" tone="muted" />
                </Card>
              </Pressable>
            </Link>
          ))}
        </View>
      </View>

      <View className="gap-3">
        <SectionHeader
          title="Destaques"
          subtitle="Quartos disponíveis agora"
          action={
            <Link href="/alojamento" asChild>
              <Pressable hitSlop={8} accessibilityRole="button">
                <Text className="text-xs font-bold text-aqua">Ver todos</Text>
              </Pressable>
            </Link>
          }
        />
        {available.length === 0 && !rooms.loading ? (
          <EmptyState
            title="Sem quartos disponíveis de momento"
            hint="Consulte a recepção para datas de chegada."
          />
        ) : null}
      </View>
    </Screen>
  );
}
