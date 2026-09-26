import '@/global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { POSProvider } from '@/providers/POSProvider';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Já ocultado ou indisponível no web: não é fatal.
});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {
      // Idem.
    });
  }, []);

  return (
    <SafeAreaProvider>
      <POSProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#040F1D' },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: { fontWeight: '800' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: '#040F1D' },
            // O POS é landscape em tablet; a animação lateral ajuda o operador
            // a perceber que está a voltar ao mapa de mesas.
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="comanda/[orderId]" options={{ title: 'Comanda' }} />
        </Stack>
      </POSProvider>
    </SafeAreaProvider>
  );
}
