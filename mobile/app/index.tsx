import { Redirect } from 'expo-router';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useAuthStore } from '../src/store/authStore';
import { Colors } from '../src/constants/theme';

/**
 * 로그인 화면은 없다. 기기 계정을 받는 동안만 기다렸다가 바로 홈으로 간다.
 * 처음 여는데 인터넷이 안 되면 계정을 못 받으니 다시 시도 버튼을 띄운다.
 */
export default function Index() {
  const { isAuthenticated, isLoading, startError, loadToken } = useAuthStore();

  if (isAuthenticated) return <Redirect href="/(tabs)" />;

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, padding: 32 }}>
      {isLoading || !startError ? (
        <ActivityIndicator size="large" color={Colors.primary} />
      ) : (
        <>
          <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 }}>
            서버에 연결하지 못했어요
          </Text>
          <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: 20 }}>
            인터넷 연결을 확인하고 다시 시도해 주세요.
          </Text>
          <TouchableOpacity
            onPress={() => loadToken()}
            style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>다시 시도</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
