import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';

/**
 * Ícones de aba desenhados com View para não depender de fontes de ícones
 * instalações: os glyphs abaixo são formas simples, legíveis a qualquer
 * tamanho, e o custo é nulo em vez de um carregamento assíncrono.
 */
function TabGlyph({ kind, focused }: { kind: 'home' | 'booking' | 'pool' | 'service' | 'account'; focused: boolean }) {
  const tint = focused ? '#FBBF24' : '#64748B';
  const ring = { borderColor: tint, borderWidth: 2 };
  const common = { borderRadius: 4 };

  switch (kind) {
    case 'home':
      return <View style={[{ width: 20, height: 20, borderTopWidth: 2, borderLeftWidth: 2, borderColor: tint, transform: [{ rotate: '45deg' }] }, common]} />;
    case 'booking':
      return <View style={[{ width: 18, height: 20, ...ring }, common]} />;
    case 'pool':
      return <View style={[{ width: 20, height: 14, ...ring, borderRadius: 10 }, common]} />;
    case 'service':
      return <View style={[{ width: 18, height: 18, ...ring, borderRadius: 9 }, common]} />;
    case 'account':
    default:
      return <View style={[{ width: 18, height: 18, ...ring, borderRadius: 9 }]} />;
  }
}

function TabIcon({ kind, focused, label }: { kind: 'home' | 'booking' | 'pool' | 'service' | 'account'; focused: boolean; label: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 4, width: 64 }}>
      <TabGlyph kind={kind} focused={focused} />
      <Text style={{ color: focused ? '#FBBF24' : '#64748B', fontSize: 10, fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A2342',
          borderTopColor: 'rgba(255,255,255,0.08)',
          borderTopWidth: 1,
          height: 78,
          paddingTop: 8,
        },
        tabBarItemStyle: { paddingVertical: 2 },
        sceneStyle: { backgroundColor: '#040F1D' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ focused }) => <TabIcon kind="home" focused={focused} label="INÍCIO" />,
        }}
      />
      <Tabs.Screen
        name="reservas"
        options={{
          title: 'Reservas',
          tabBarIcon: ({ focused }) => <TabIcon kind="booking" focused={focused} label="RESERVAS" />,
        }}
      />
      <Tabs.Screen
        name="piscinas"
        options={{
          title: 'Piscinas',
          tabBarIcon: ({ focused }) => <TabIcon kind="pool" focused={focused} label="PISCINAS" />,
        }}
      />
      <Tabs.Screen
        name="servicos"
        options={{
          title: 'Serviços',
          tabBarIcon: ({ focused }) => <TabIcon kind="service" focused={focused} label="SERVIÇOS" />,
        }}
      />
      <Tabs.Screen
        name="conta"
        options={{
          title: 'Conta',
          tabBarIcon: ({ focused }) => <TabIcon kind="account" focused={focused} label="CONTA" />,
        }}
      />
    </Tabs>
  );
}
