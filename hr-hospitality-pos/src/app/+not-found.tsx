import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-ocean-dark px-6">
      <Text className="text-2xl font-black text-white">Ecrã não encontrado</Text>
      <Text className="text-center text-sm text-white/50">O endereço que abriu não existe nesta aplicação.</Text>
      <Link href="/" className="text-sm font-black text-aqua">
        Voltar ao início
      </Link>
    </View>
  );
}
