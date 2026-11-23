import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../src/constants/theme';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';

export default function RootLayout() {
  const loadToken = useAuthStore((s) => s.loadToken);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadToken();
    loadSettings();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="inbox" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}
