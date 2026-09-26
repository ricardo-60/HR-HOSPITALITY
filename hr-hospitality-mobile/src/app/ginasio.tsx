import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { Badge, Banner, Button, Card, EmptyState, Loading, OfflineBanner, Screen, SectionHeader } from '@/components/ui';
import { HOTEL } from '@/constants/hotel';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { formatDay, formatKz } from '@/lib/format';
import { fetchGuestPasses, fetchGymPlans, guestPriceFor, issueGymPass, type GymPlan } from '@/lib/services';

const PLAN_LABEL: Record<GymPlan['plan_type'], string> = {
  DIARIA: 'Diária',
  SEMANAL: 'Semanal',
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  ANUAL: 'Anual',
};

const PASS_TONE = {
  ATIVO: 'success',
  USADO: 'muted',
  EXPIRADO: 'muted',
  CANCELADO: 'danger',
} as const;

/**
 * Ginásio: catálogo público e passes do hóspede.
 *
 * O acesso incluído aplica-se a hóspedes com KYC aprovado eestadia activa. A
 * regra é aplicada por trigger e policy na base de dados, não aqui: se o
 * preço não bater certo com o plano, a emissão é recusada.
 */
export default function GymScreen() {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const plans = useCachedQuery(fetchGymPlans, 'gym-plans');
  const passes = useCachedQuery(fetchGuestPasses, 'gym-passes');

  const issue = useCallback(
    async (plan: GymPlan) => {
      setBusyPlan(plan.id);
      setError(null);
      setNotice(null);
      const result = await issueGymPass(plan);
      setBusyPlan(null);
      if (!result.ok) { setError(result.error); return; }
      setNotice(
        plan.guest_included
          ? 'Passe emitido: acesso incluído na sua estadia.'
          : `Passe emitido. Pague ${formatKz(guestPriceFor(plan))} na recepção.`,
      );
      await passes.refresh();
    },
    [passes],
  );

  const list = plans.data ?? [];
  const myPasses = passes.data ?? [];

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={plans.loading}
          onRefresh={() => { void plans.refresh(); void passes.refresh(); }}
          tintColor="#FBBF24"
        />
      }
    >
      <View className="gap-1">
        <Text className="text-2xl font-black text-white">Ginásio</Text>
        <Text className="text-sm text-white/50">
          Diárias e mensalidades. Hóspedes com acesso incluído não pagam.
        </Text>
      </View>

      {error ? <Banner tone="error" message={error} /> : null}
      {notice ? <Banner tone="success" message={notice} /> : null}
      <OfflineBanner cachedLabel={plans.cachedLabel} error={plans.error} onRetry={plans.refresh} />

      {passes.error ? (
        <Card className="gap-2">
          <Text className="text-sm text-white/70">{passes.error}</Text>
          <Button label="Registar-me / ver documentos" variant="secondary" onPress={() => router.push('/kyc')} />
        </Card>
      ) : null}

      <View className="gap-3">
        <SectionHeader title="Os meus passes" subtitle={`${myPasses.length} registados`} />
        {myPasses.length === 0 ? (
          <EmptyState title="Ainda não tem passes" hint="Escolha uma modalidade abaixo para emitir." />
        ) : (
          myPasses.map(pass => (
            <Card key={pass.id} className="gap-2">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-sm font-bold text-white">{pass.holder_name}</Text>
                <Badge label={pass.status} tone={PASS_TONE[pass.status]} />
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-white/50">
                  Válido até {formatDay(pass.valid_until)}
                </Text>
                <Text className="text-sm font-black text-gold">{formatKz(pass.price_paid)}</Text>
              </View>
            </Card>
          ))
        )}
      </View>

      <View className="gap-3">
        <SectionHeader title="Modalidades" subtitle={`${list.length} disponíveis`} />
        {plans.loading && !plans.data ? (
          <Loading label="A carregar o ginásio…" />
        ) : list.length === 0 ? (
          <EmptyState title="Preçários indisponíveis" hint="Sem ligação e sem cache guardado." />
        ) : (
          list.map(plan => {
            const price = guestPriceFor(plan);
            return (
              <Card key={plan.id} className="gap-3">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-base font-bold text-white">{plan.name}</Text>
                    <Text className="text-xs text-white/45 mt-0.5">
                      {PLAN_LABEL[plan.plan_type]} · {plan.duration_days} dia(s)
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-lg font-black text-gold">
                      {price === 0 ? 'Incluído' : formatKz(price)}
                    </Text>
                    {plan.guest_discount_pct > 0 && price > 0 ? (
                      <Text className="text-[10px] font-bold text-emerald-300">
                        {plan.guest_discount_pct.toFixed(0)}% desconto hóspede
                      </Text>
                    ) : null}
                  </View>
                </View>

                {plan.description ? (
                  <Text className="text-xs leading-relaxed text-white/55">{plan.description}</Text>
                ) : null}

                <Text className="text-[10px] text-white/35">
                  Preço geral {formatKz(plan.price)} · {HOTEL.name}
                </Text>

                <Button
                  label={plan.guest_included ? 'Emitir passe incluído' : 'Emitir passe'}
                  loading={busyPlan === plan.id}
                  onPress={() => void issue(plan)}
                />
              </Card>
            );
          })
        )}
      </View>

      <Card className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-wider text-white/45">Como funciona a inclusão</Text>
        <Text className="text-sm leading-relaxed text-white/65">
          Hóspedes com documentation validada e estadia activa têm acesso incluído nos planos
          marcados como tal. O preço é confirmado pela base de dados na emissão do passe — não é
         possível contornar pela app.
        </Text>
      </Card>

      <Button label="Voltar" variant="secondary" onPress={() => router.back()} />

      <Pressable accessibilityRole="button" onPress={() => router.push('/servicos')}>
        <Text className="text-center text-sm font-bold text-aqua">Ver também lavandaria e eventos</Text>
      </Pressable>
    </Screen>
  );
}
