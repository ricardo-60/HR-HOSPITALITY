import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View, type RefreshControlProps } from 'react-native';

import { PROPERTY_LABEL, SERVICE_LABEL, type TenantIdentity as TenantIdentityData } from '@/types/executive';

/** Componentes base da app de gestão. Só de leitura. */

export function Screen({
  children,
  refreshControl,
}: {
  children: ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  return (
    <ScrollView
      className="flex-1 bg-ocean-dark"
      contentContainerClassName="gap-5 p-4 pb-24"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Pull-to-refresh dos painéis.
 *
 * Em Android o `ScrollView` faz *wrap* do ecrã neste componente e injecta-lhe
 * `style` (o `flex: 1` que dá altura ao ecrã) e `children` (o próprio
 * `ScrollView`). Um wrapper que só repasse `refreshing`/`onRefresh` descarta
 * as duas coisas: fica um `SwipeRefreshLayout` órfão, sem filhos e a 0 px —
 * ecrã inteiro preto depois do login. Por isso repassa todos os props.
 */
export function Refresh(props: RefreshControlProps) {
  return <RefreshControl {...props} tintColor="#FBBF24" />;
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-white/10 pb-4">
      <View className="flex-1">
        <Text className="text-2xl font-black text-white">{title}</Text>
        {subtitle ? <Text className="text-xs text-white/45 mt-0.5">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/**
 * Cabeçalho dinâmico do tenant: tipologia e serviços ativos.
 *
 * Sem migração 010 (ou sem dados) `propertyType` e `activeServices` vêm
 * vazios e o componente desaparece — o nome continua no título, sem crash.
 */
export function TenantIdentity({ identity }: { identity: TenantIdentityData | null }) {
  const tipology = identity?.propertyType ? PROPERTY_LABEL[identity.propertyType] : null;
  if (!identity || (!tipology && identity.activeServices.length === 0)) return null;

  return (
    <View className="flex-row flex-wrap items-center gap-1.5 pt-3">
      {tipology ? (
        <View className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1">
          <Text className="text-[10px] font-black uppercase tracking-wider text-gold">{tipology}</Text>
        </View>
      ) : null}
      {identity.activeServices.map(service => (
        <View key={service} className="rounded-full border border-aqua/30 bg-aqua/10 px-2.5 py-1">
          <Text className="text-[10px] font-black uppercase tracking-wider text-aqua">{SERVICE_LABEL[service]}</Text>
        </View>
      ))}
    </View>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-3xl border border-white/10 bg-ink p-4 ${className}`}>{children}</View>;
}

/** Métrica grande com variação opcional face ao período homólogo. */
export function Metric({
  label,
  value,
  delta,
  tone = 'default',
}: {
  label: string;
  value: string;
  delta?: number | null;
  tone?: 'default' | 'inflow' | 'outflow';
}) {
  const valueColor = tone === 'inflow' ? 'text-inflow' : tone === 'outflow' ? 'text-outflow' : 'text-white';
  return (
    <Card className="flex-1 gap-1">
      <Text className="text-[10px] font-black uppercase tracking-wider text-white/40">{label}</Text>
      <Text className={`text-2xl font-black ${valueColor}`}>{value}</Text>
      {delta !== undefined && delta !== null ? (
        <Text
          className={`text-[11px] font-black ${
            delta >= 0 ? 'text-inflow' : 'text-outflow'
          }`}
        >
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}% vs. mês anterior
        </Text>
      ) : null}
    </Card>
  );
}

export function Bar({
  label,
  value,
  rawValue,
  max,
  tone = 'aqua',
}: {
  label: string;
  /** Texto já formatado, apresentado no ecrã. */
  value: string;
  /** Valor numérico, usado só para a proporção da barra. */
  rawValue: number;
  max: number;
  tone?: 'aqua' | 'gold' | 'inflow';
}) {
  const ratio = max > 0 ? Math.max(0.04, Math.min(1, rawValue / max)) : 0.04;
  const barClass = tone === 'gold' ? 'bg-gold' : tone === 'inflow' ? 'bg-inflow' : 'bg-aqua';
  const textClass = tone === 'gold' ? 'text-gold' : tone === 'inflow' ? 'text-inflow' : 'text-aqua';
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-white/75" numberOfLines={1}>{label}</Text>
        <Text className={`text-sm font-black ${textClass}`}>{value}</Text>
      </View>
      <View className="h-2 w-full overflow-hidden rounded-full bg-white/8">
        <View className={`h-full rounded-full ${barClass}`} style={{ width: `${ratio * 100}%` }} />
      </View>
    </View>
  );
}

export function Banner({ tone, message }: { tone: 'error' | 'info'; message: string }) {
  const box = tone === 'error' ? 'border-rose-400/30 bg-rose-500/10' : 'border-gold/30 bg-gold/10';
  const text = tone === 'error' ? 'text-rose-200' : 'text-gold';
  return (
    <View className={`rounded-2xl border px-4 py-3 ${box}`}>
      <Text className={`text-sm font-semibold ${text}`}>{message}</Text>
    </View>
  );
}

export function Loading({ label = 'A carregar…' }: { label?: string }) {
  return (
    <View className="items-center gap-3 py-12">
      <ActivityIndicator color="#FBBF24" size="large" />
      <Text className="text-sm text-white/50">{label}</Text>
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="items-center gap-1.5 py-8">
      <Text className="text-center text-sm font-semibold text-white/70">{title}</Text>
      {hint ? <Text className="text-center text-xs text-white/40">{hint}</Text> : null}
    </Card>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address';
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-[11px] font-black uppercase tracking-wider text-white/45">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748B"
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        className="rounded-2xl border border-white/15 bg-ink-soft px-4 py-3.5 text-base font-semibold text-white"
      />
    </View>
  );
}

export function Button({ label, onPress, variant = 'secondary' }: { label: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'danger' }) {
  const tone =
    variant === 'primary'
      ? 'bg-gold'
      : variant === 'danger'
        ? 'bg-rose-600/80'
        : 'border border-white/20 bg-white/5';
  const text = variant === 'primary' ? 'text-ocean' : 'text-white';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`min-h-[52px] items-center justify-center rounded-2xl px-5 ${tone} active:opacity-80`}
    >
      <Text className={`text-sm font-black ${text}`}>{label}</Text>
    </Pressable>
  );
}
