import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';

import { Badge, Card, EmptyState, Field, Loading, OfflineBanner, Screen, SectionHeader } from '@/components/ui';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { RESERVATION_STATUS_LABEL, formatDay, formatKz } from '@/lib/format';
import { fetchReservations } from '@/lib/queries';
import type { Reservation } from '@/types/hotel';

const TONE_BY_STATUS: Record<string, 'success' | 'warning' | 'muted' | 'danger'> = {
  CONFIRMADA: 'success',
  CHECKED_IN: 'success',
  PENDENTE_PAGAMENTO: 'warning',
  CANCELADA: 'danger',
  CHECKED_OUT: 'muted',
};

function ReservationRow({ reservation }: { reservation: Reservation }) {
  return (
    <Card className="gap-2">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-bold text-white">{reservation.reference}</Text>
          <Text className="text-xs text-white/50">
            {reservation.guest_name} · {formatDay(reservation.reservation_date)}
          </Text>
        </View>
        <Badge
          label={RESERVATION_STATUS_LABEL[reservation.status] ?? reservation.status}
          tone={TONE_BY_STATUS[reservation.status] ?? 'muted'}
        />
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-xs uppercase tracking-wider text-white/40">{reservation.service_type}</Text>
        <Text className="text-sm font-bold text-gold">{formatKz(reservation.total_amount)}</Text>
      </View>
    </Card>
  );
}

/**
 * Ecrã de reservas.
 *
 * A app não tem autenticação de hóspede (a Fase 1 do projeto desktop é só para
 * staff), por isso a lista é filtrada pelo email introduzido. É a mesma coluna
 * que a RLS protege no resto do sistema.
 */
export default function ReservationsScreen() {
  const [email, setEmail] = useState('');

  const query = useCachedQuery(() => fetchReservations(email), `res:${email.trim().toLowerCase()}`);

  const reservations = useMemo(() => query.data ?? [], [query.data]);
  const ready = email.includes('@');

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={query.loading} onRefresh={query.refresh} tintColor="#FBBF24" />
      }
    >
      <View className="gap-1">
        <Text className="text-2xl font-black text-white">As minhas reservas</Text>
        <Text className="text-sm text-white/50">
          Introduza o email usado na reserva para consultar o histórico.
        </Text>
      </View>

      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="reservas@exemplo.ao"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      {!ready ? (
        <EmptyState
          title="Introduza um email válido"
          hint="As reservas são sempre registadas com um email de contacto."
        />
      ) : query.loading && !query.data ? (
        <Loading label="A consultar reservas…" />
      ) : (
        <>
          <OfflineBanner cachedLabel={query.cachedLabel} error={query.error} onRetry={query.refresh} />
          <SectionHeader
            title="Histórico"
            subtitle={`${reservations.length} ${reservations.length === 1 ? 'registo' : 'registos'}`}
          />
          <View className="gap-3">
            {reservations.length === 0 ? (
              <EmptyState
                title="Ainda não há reservas para este email"
                hint="Comece por escolher um quarto ou uma piscina."
              />
            ) : (
              reservations.map(item => <ReservationRow key={item.id} reservation={item} />)
            )}
          </View>
        </>
      )}

      <Link href="/alojamento" asChild>
        <Text className="text-center text-sm font-bold text-aqua">+ Nova reserva</Text>
      </Link>
    </Screen>
  );
}
