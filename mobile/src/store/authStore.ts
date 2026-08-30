import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { authAPI } from '../services/api';
import { registerForPush } from '../services/push';

interface User {
  id: string;
  email: string;
  username: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  loadToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  loadToken: async () => {
    try {
      const token = await AsyncStorage.getItem('access_token');
      if (token) {
        // 토큰으로 유저 정보 가져오기
        const res = await api.get('/auth/me');
        set({ token, user: res.data, isAuthenticated: true, isLoading: false });
        registerForPush(); // 기기 푸시 토큰 등록 (guard됨, 실패해도 무시)
      } else {
        set({ isLoading: false });
      }
    } catch {
      await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    const res = await authAPI.login(email, password);
    const { access_token, refresh_token } = res.data;
    // 리프레시 토큰을 받고도 버리고 있었다. 그래서 30분 뒤 액세스 토큰이
    // 만료되면 갱신할 방법이 없어 그대로 로그아웃됐다.
    await AsyncStorage.setItem('access_token', access_token);
    if (refresh_token) await AsyncStorage.setItem('refresh_token', refresh_token);

    // 유저 정보 가져오기
    const userRes = await api.get('/auth/me');
    set({ token: access_token, user: userRes.data, isAuthenticated: true });
    registerForPush(); // 기기 푸시 토큰 등록
  },

  register: async (email: string, password: string, username: string) => {
    await authAPI.register(email, password, username);
    // 가입 후 자동 로그인
    await get().login(email, password);
  },

  setUser: (user) => set({ user }),

  logout: async () => {
    await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
