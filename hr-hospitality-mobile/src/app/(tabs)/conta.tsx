import { useRouter } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';

import { Card, Screen, SectionHeader } from '@/components/ui';
import { HOTEL, isPlaceholderIban } from '@/constants/hotel';
import { clearCache } from '@/lib/cache';
import { isSupabaseConfigured } from '@/lib/supabase';

function Row({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-4 py-2">
      <Text className="text-sm text-white/55">{label}</Text>
      <Text className={`flex-1 text-right text-sm font-semibold ${warn ? 'text-gold' : 'text-white'}`}>
        {value}
      </Text>
    </View>
  );
}

export default function AccountScreen() {
  const router = useRouter();

  const wipeCache = () => {
    void clearCache().then(() => Alert.alert('Cache limpa', 'Os catálogos serão descarregados de novo.'));
  };

  return (
    <Screen>
      <View className="gap-1">
        <Text className="text-2xl font-black text-white">Conta</Text>
        <Text className="text-sm text-white/50">Configuração e apoio.</Text>
      </View>

      <Card className="gap-1 divide-y divide-white/5">
        <Row label="Estabelecimento" value={HOTEL.name} />
        <Row label="Email" value={HOTEL.email} />
        <Row label="Telefone" value={HOTEL.phone} />
        <Row
          label="Supabase"
          value={isSupabaseConfigured ? 'Ligado' : 'Por configurar'}
          warn={!isSupabaseConfigured}
        />
        <Row
          label="IBAN de pagamento"
          value={isPlaceholderIban() ? 'Por configurar' : 'Configurado'}
          warn={isPlaceholderIban()}
        />
      </Card>

      {isPlaceholderIban() ? (
        <Card className="gap-1 border-gold/30 bg-gold/10">
          <Text className="text-xs font-bold uppercase tracking-wider text-gold">Antes de publicar</Text>
          <Text className="text-sm leading-relaxed text-white/70">
            Substitua o IBAN em src/constants/hotel.ts. Enquanto for um valor de exemplo, a app
            recusa-se a enviar instruções de pagamento por WhatsApp.
          </Text>
        </Card>
      ) : null}

      <View className="gap-3">
        <SectionHeader title="Dados locais" />
        <Pressable accessibilityRole="button" onPress={wipeCache} className="active:opacity-80">
          <Card className="gap-1">
            <Text className="text-sm font-semibold text-white">Limpar cache offline</Text>
            <Text className="text-xs text-white/50">
              Remove quartos, piscinas e preçários guardados no dispositivo.
            </Text>
          </Card>
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push('/checkout')} className="active:opacity-80">
        <Card className="gap-1">
          <Text className="text-sm font-semibold text-aqua">Retomar reserva em curso</Text>
          <Text className="text-xs text-white/50">Volta ao ecrã de pagamento.</Text>
        </Card>
      </Pressable>
    </Screen>
  );
}
