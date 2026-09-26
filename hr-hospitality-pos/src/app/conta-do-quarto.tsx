import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Banner, Button, Card, EmptyState, Header, Loading } from '@/components/ui';
import { listActiveStays, openOrder, type Result } from '@/lib/posApi';
import type { PosOrder, StayCharge } from '@/types/pos';

/**
 * Venda lançada na conta do quarto.
 *
 * A validação da estadia é a parte crítica: só entram reservas `CONFIRMADA` ou
 * `CHECKED_IN`, ou seja hóspedes com check-in feito. A RLS limita a consulta ao
 * tenant do operador, pelo que um número de quarto de outro hotel não aparece.
 */
export default function RoomChargeScreen() {
  const router = useRouter();
  const [stays, setStays] = useState<StayCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const result = await listActiveStays();
        if (cancelled) return;
        if (!result.ok) setError(result.error);
        else setStays(result.data);
        setLoading(false);
      })();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const charge = async (stay: StayCharge) => {
    setBusyId(stay.reservation_id);
    setError(null);
    const result: Result<PosOrder> = await openOrder({
      tableId: null,
      reservationId: stay.reservation_id,
      customerName: stay.guest_name,
      guestCount: 1,
    });
    setBusyId(null);
    if (!result.ok) { setError(result.error); return; }
    router.push({ pathname: '/comanda/[orderId]', params: { orderId: result.data.id } });
  };

  return (
    <ScrollView className="flex-1 bg-ocean-dark" contentContainerClassName="gap-4 p-4 pb-24">
      <Header title="Conta do quarto" subtitle="Estadias activas deste hotel" />

      {error ? <Banner tone="error" message={error} onClose={() => setError(null)} /> : null}

      {loading ? (
        <Loading label="A validar estadias…" />
      ) : stays.length === 0 ? (
        <EmptyState
          title="Nenhuma estadia activa"
          hint="Só entram hóspedes com reserva confirmada ou check-in feito."
        />
      ) : (
        <View className="gap-3">
          {stays.map(stay => (
            <Card key={stay.reservation_id} className="flex-row items-center gap-4">
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-aqua/10">
                <Text className="text-lg font-black text-aqua">{stay.room_number ?? '—'}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-black text-white">{stay.guest_name}</Text>
                <Text className="text-xs text-white/45 mt-0.5">
                  {stay.reference} · {stay.status}
                </Text>
              </View>
              <Button
                label="Lançar"
                loading={busyId === stay.reservation_id}
                onPress={() => void charge(stay)}
              />
            </Card>
          ))}
        </View>
      )}

      <Card className="gap-2">
        <Text className="text-xs font-black uppercase tracking-wider text-white/40">Como funciona</Text>
        <Text className="text-sm text-white/60 leading-relaxed">
          O consumo entra como comanda de hóspede e é somado à conta do quarto. A liquidação
          acontece no checkout geral, com a reserva. A comanda só fecha como
          <span className="text-white"> CONTA_DO_QUARTO</span> — a base de dados recusa qualquer
          outro meio para uma comanda com reserva associada.
        </Text>
      </Card>

      <Button label="Voltar ao mapa de mesas" variant="secondary" onPress={() => router.replace('/')} />
    </ScrollView>
  );
}
