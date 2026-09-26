import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
} from 'react-native';

/* ── Screen ────────────────────────────────────────────────────────────── */

export function Screen({
  children,
  scroll = true,
  refreshControl,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  if (!scroll) {
    return <View className="flex-1 bg-ocean-dark">{children}</View>;
  }
  return (
    <ScrollView
      className="flex-1 bg-ocean-dark"
      contentContainerClassName="gap-5 px-4 pb-28 pt-4"
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/* ── Card ──────────────────────────────────────────────────────────────── */

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={`rounded-3xl border border-white/10 bg-ink p-4 ${className}`}>{children}</View>
  );
}

/* ── SectionHeader ─────────────────────────────────────────────────────── */

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View className="flex-row items-end justify-between gap-3">
      <View className="flex-1">
        <Text className="text-lg font-bold text-white">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-xs text-white/50">{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

/* ── Badge ─────────────────────────────────────────────────────────────── */

type BadgeTone = 'success' | 'warning' | 'muted' | 'accent' | 'danger';

const BADGE_TONE: Record<BadgeTone, string> = {
  success: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300',
  warning: 'bg-gold/15 border-gold/40 text-gold',
  muted: 'bg-white/5 border-white/15 text-white/60',
  accent: 'bg-aqua/15 border-aqua/40 text-aqua',
  danger: 'bg-rose-500/15 border-rose-400/40 text-rose-300',
};

export function Badge({ label, tone = 'muted' }: { label: string; tone?: BadgeTone }) {
  return (
    <View className={`self-start rounded-full border px-2.5 py-1 ${BADGE_TONE[tone]}`}>
      <Text className="text-[10px] font-bold uppercase tracking-wider">{label}</Text>
    </View>
  );
}

/* ── Button ────────────────────────────────────────────────────────────── */

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  className = '',
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const inert = disabled || loading;
  const base = 'items-center justify-center rounded-2xl px-5 py-3.5';
  const tone =
    variant === 'primary'
      ? 'bg-gold'
      : variant === 'secondary'
        ? 'border border-white/20 bg-white/5'
        : 'bg-transparent';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPress={onPress}
      className={`${base} ${tone} ${inert ? 'opacity-40' : ''} ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#0A2342' : '#FFFFFF'} />
      ) : (
        <Text
          className={`text-sm font-bold ${
            variant === 'primary' ? 'text-ocean' : 'text-white'
          }`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/* ── Field ─────────────────────────────────────────────────────────────── */

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  multiline = false,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  multiline?: boolean;
  editable?: boolean;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-semibold uppercase tracking-wider text-white/50">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748B"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        editable={editable}
        className="rounded-2xl border border-white/15 bg-ink-soft px-4 py-3 text-base text-white"
      />
    </View>
  );
}

/* ── EmptyState ────────────────────────────────────────────────────────── */

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="items-center gap-2 py-10">
      <Text className="text-center text-sm font-semibold text-white/80">{title}</Text>
      {hint ? <Text className="text-center text-xs text-white/45">{hint}</Text> : null}
    </Card>
  );
}

/* ── Loading ───────────────────────────────────────────────────────────── */

export function Loading({ label = 'A carregar…' }: { label?: string }) {
  return (
    <View className="items-center gap-3 py-12">
      <ActivityIndicator color="#FBBF24" />
      <Text className="text-xs text-white/50">{label}</Text>
    </View>
  );
}

/* ── Banner ────────────────────────────────────────────────────────────── */

export function Banner({
  tone,
  message,
  onClose,
}: {
  tone: 'error' | 'success' | 'info';
  message: string;
  onClose?: () => void;
}) {
  const box =
    tone === 'error'
      ? 'border-rose-400/30 bg-rose-500/10'
      : tone === 'success'
        ? 'border-emerald-400/30 bg-emerald-500/10'
        : 'border-gold/30 bg-gold/10';
  const text = tone === 'error' ? 'text-rose-200' : tone === 'success' ? 'text-emerald-200' : 'text-gold';

  return (
    <View className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${box}`}>
      <Text className={`flex-1 text-sm font-semibold ${text}`}>{message}</Text>
      {onClose ? (
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar">
          <Text className={`text-sm font-black ${text}`}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ── OfflineBanner ─────────────────────────────────────────────────────── */

export function OfflineBanner({
  cachedLabel,
  error,
  onRetry,
}: {
  cachedLabel?: string | null;
  error?: string | null;
  onRetry?: () => void;
}) {
  if (!error && !cachedLabel) return null;

  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-xs font-bold text-gold">
          {error ? 'Sem ligação — a mostrar dados guardados' : 'Dados guardados no dispositivo'}
        </Text>
        {cachedLabel ? <Text className="text-[11px] text-gold/70">{cachedLabel}</Text> : null}
      </View>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
          <Text className="text-xs font-bold text-gold">Tentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
