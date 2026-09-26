import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

/**
 * Componentes base do POS.
 *
 * Tudo é touch-first: alvos com 56 px ou mais de altura, contraste alto e
 * tipografia grande. O operador usa esta app de pé, com as mãos ocupadas, num
 * tablet de 10" — alvos pequenos são um risco operacional, não só estético.
 */

const TOUCH = 'min-h-[56px]';

export function Screen({
  children,
  scroll = true,
  refreshControl,
  contentClassName = 'gap-4 p-4',
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<never>;
  contentClassName?: string;
}) {
  if (!scroll) {
    return <View className="flex-1 bg-ocean-dark">{children}</View>;
  }
  return (
    <ScrollView
      className="flex-1 bg-ocean-dark"
      contentContainerClassName={`${contentClassName} pb-24`}
      refreshControl={refreshControl as never}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-4 border-b border-white/10 pb-4">
      <View className="flex-1">
        <Text className="text-2xl font-black text-white">{title}</Text>
        {subtitle ? <Text className="text-xs text-white/45 mt-0.5">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-3xl border border-white/10 bg-ink p-4 ${className}`}>{children}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-gold active:bg-gold-dark',
  secondary: 'border border-white/20 bg-white/5 active:bg-white/10',
  danger: 'bg-rose-600/80 active:bg-rose-700',
  success: 'bg-emerald-600/80 active:bg-emerald-700',
};

const BUTTON_TEXT: Record<ButtonVariant, string> = {
  primary: 'text-ocean',
  secondary: 'text-white',
  danger: 'text-white',
  success: 'text-white',
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  compact = false,
  className = '',
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const inert = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPress={onPress}
      className={`${TOUCH} items-center justify-center rounded-2xl px-5 ${compact ? 'py-2' : 'py-3'} ${BUTTON_VARIANT[variant]} ${inert ? 'opacity-35' : ''} ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#0A2342' : '#FFFFFF'} />
      ) : (
        <Text className={`text-sm font-black ${BUTTON_TEXT[variant]}`}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
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
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        className="rounded-2xl border border-white/15 bg-ink-soft px-4 py-3.5 text-base font-semibold text-white"
      />
    </View>
  );
}

export function Banner({
  tone,
  message,
  onClose,
}: {
  tone: 'error' | 'success' | 'info';
  message: string;
  onClose?: () => void;
}) {
  const toneClass =
    tone === 'error'
      ? 'border-rose-400/30 bg-rose-500/10'
      : tone === 'success'
        ? 'border-emerald-400/30 bg-emerald-500/10'
        : 'border-gold/30 bg-gold/10';
  const textClass =
    tone === 'error' ? 'text-rose-200' : tone === 'success' ? 'text-emerald-200' : 'text-gold';

  return (
    <View className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${toneClass}`}>
      <Text className={`flex-1 text-sm font-semibold ${textClass}`}>{message}</Text>
      {onClose ? (
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar">
          <Text className={`text-sm font-black ${textClass}`}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="items-center gap-1.5 py-10">
      <Text className="text-center text-sm font-bold text-white/75">{title}</Text>
      {hint ? <Text className="text-center text-xs text-white/40">{hint}</Text> : null}
    </Card>
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
