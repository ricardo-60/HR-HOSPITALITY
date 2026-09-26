import '@/global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BookingProvider } from '@/providers/BookingProvider';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Já ocultado, ou a API não disponível no web. Não é fatal.
});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {
      // Idem: esconder o splash nunca deve quebrar o arranque.
    });
  }, []);

  return (
    <SafeAreaProvider>
      <BookingProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#040F1D' },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: '#040F1D' },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="checkout" options={{ title: 'Pagamento', presentation: 'modal' }} />
        </Stack>
      </BookingProvider>
    </SafeAreaProvider>
  );
}
