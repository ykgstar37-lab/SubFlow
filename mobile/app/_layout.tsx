import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../src/constants/theme';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { syncWidget } from '../src/services/widgetSync';

export default function RootLayout() {
  const loadToken = useAuthStore((s) => s.loadToken);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    loadToken();
    loadSettings();
  }, []);

  // 홈 화면 위젯에 결제 일정을 넘긴다. 앱을 열 때, 그리고 구독을 고치고 나갈 때.
  useEffect(() => {
    if (!isAuthenticated) return;
    syncWidget();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' || s === 'background') syncWidget();
    });
    return () => sub.remove();
  }, [isAuthenticated]);

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
