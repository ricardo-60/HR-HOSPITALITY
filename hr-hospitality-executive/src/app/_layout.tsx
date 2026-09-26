import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ExecutiveProvider } from '@/providers/ExecutiveProvider';

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
      <ExecutiveProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#040F1D' },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: { fontWeight: '800' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: '#040F1D' },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="economato" options={{ title: 'Economato e stock' }} />
          <Stack.Screen name="vendas" options={{ title: 'Bar e snack-bar' }} />
        </Stack>
      </ExecutiveProvider>
    </SafeAreaProvider>
  );
}
