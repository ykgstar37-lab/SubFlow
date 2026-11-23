import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { authAPI, setOnAuthLost } from '../services/api';
import { registerForPush } from '../services/push';

interface User {
  id: string;
  email: string | null;
  username: string;
  email_verified?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** 처음 계정을 받다가 실패했을 때(오프라인 등). 첫 화면에서 다시 시도 버튼을 띄운다. */
  startError: boolean;

  loadToken: (retried?: boolean) => Promise<void>;
  /** 이메일에 6자리 코드를 붙여 지금 계정에 연결한다. 이미 있던 계정이면 그쪽으로 합쳐진다. */
  linkEmail: (email: string, code: string) => Promise<{ merged: boolean }>;
  /** 이 기기의 계정을 버리고 새 기기 계정으로 시작한다 (계정 삭제 뒤). */
  startFresh: () => Promise<void>;
  setUser: (user: User) => void;
}

async function saveTokens(access: string, refresh?: string) {
  await AsyncStorage.setItem('access_token', access);
  if (refresh) await AsyncStorage.setItem('refresh_token', refresh);
}

/**
 * 앱에는 로그인이 없다. 처음 열면 서버가 이메일 없는 '기기 계정'을 만들어 주고,
 * 그 열쇠(리프레시 토큰)를 기기에 보관한다. 이메일은 사람이 원할 때 설정에서
 * 6자리 코드로 붙이고, 그 이메일로 웹에서도 같은 구독을 본다.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  startError: false,

  loadToken: async (retried = false) => {
    set({ isLoading: true, startError: false });
    try {
      let token = await AsyncStorage.getItem('access_token');
      if (!token) {
        const res = await authAPI.createDevice();
        await saveTokens(res.data.access_token, res.data.refresh_token);
        token = res.data.access_token;
      }
      // 액세스 토큰이 만료됐으면 api 인터셉터가 리프레시 토큰으로 갈아 끼운다
      const me = await api.get('/auth/me');
      set({
        token: await AsyncStorage.getItem('access_token') ?? token,
        user: me.data,
        isAuthenticated: true,
        isLoading: false,
      });
      registerForPush(); // 기기 푸시 토큰 등록 (guard됨, 실패해도 무시)
    } catch (e: any) {
      // 토큰이 아예 안 먹으면(서버에서 계정이 지워짐 등) 새 기기 계정으로 다시 시작한다.
      // 네트워크 오류면 토큰을 지우지 않는다. 지우면 다음에 열 때 데이터가 없는 새 계정이 생긴다.
      if (e?.response?.status === 401) {
        await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
        if (!retried) return get().loadToken(true);
      }
      set({ token: null, user: null, isAuthenticated: false, isLoading: false, startError: true });
    }
  },

  linkEmail: async (email: string, code: string) => {
    const res = await authAPI.linkEmail(email, code);
    // 이미 있던 계정으로 합쳐졌으면 그 계정의 토큰으로 바뀐다. 합쳐지지 않아도 새로 받아 둔다.
    await saveTokens(res.data.access_token, res.data.refresh_token);
    const me = await api.get('/auth/me');
    set({ token: res.data.access_token, user: me.data, isAuthenticated: true });
    if (res.data.merged) registerForPush();
    return { merged: !!res.data.merged };
  },

  startFresh: async () => {
    // 온보딩 안내도 새 사람 기준으로 다시 보여 준다
    await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'subflow-onboarded']);
    set({ token: null, user: null, isAuthenticated: false });
    await get().loadToken();
  },

  setUser: (user) => set({ user }),
}));

// 쓰는 중에 열쇠가 안 먹으면(서버에서 계정이 사라짐 등) 새 기기 계정을 받는다.
// 앱을 여는 중(loadToken)이면 그쪽이 알아서 처리하므로 건너뛴다.
setOnAuthLost(() => {
  const st = useAuthStore.getState();
  if (!st.isLoading) st.loadToken(true);
});
