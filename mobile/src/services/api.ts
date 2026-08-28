import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

// 개발 중 백엔드 호스트를 Expo 개발 서버(Metro) 호스트에서 자동 추론한다.
// → 폰이 이미 붙어 있는 PC의 IP를 그대로 사용하므로, IP가 바뀌어도 하드코딩 수정 불필요.
//   웹/모바일이 항상 같은 백엔드(같은 DB)를 바라봐 계정이 공유된다.
const hostUri =
  Constants.expoConfig?.hostUri ??
  (Constants as any).expoGoConfig?.debuggerHost ??
  (Constants as any).manifest?.debuggerHost ??
  '';
const devHost = hostUri.split(':')[0] || 'localhost';

// 웹: localhost / 모바일(네이티브): Metro 호스트 IP
const API_BASE_URL = __DEV__
  ? Platform.OS === 'web'
    ? 'http://localhost:8000/api/v1'
    : `http://${devHost}:8000/api/v1`
  : 'https://api.mysubflow.app/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401 발생 시 토큰 정리 + 로그인 화면으로 자동 이동 (반복 알림 방지를 위해 디바운스)
let lastAuthRedirect = 0;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('access_token');
      // /auth/login 호출 자체의 401(잘못된 비번)은 redirect 안 함
      const url: string | undefined = error.config?.url;
      const isLoginCall = url?.includes('/auth/login') || url?.includes('/auth/register');
      const now = Date.now();
      if (!isLoginCall && now - lastAuthRedirect > 1500) {
        lastAuthRedirect = now;
        try { router.replace('/(auth)/login'); } catch { /* router 미준비 시 무시 */ }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ── Auth ──
export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, username: string) =>
    api.post('/auth/register', { email, password, username }),
  getMe: () => api.get('/auth/me'),
  // 계정 삭제 — 본문에 비밀번호를 실어 보낸다 (axios는 delete에 data 지원)
  deleteAccount: (password: string) => api.delete('/auth/me', { data: { password } }),
  // 재설정 메일 요청. 가입 여부와 무관하게 항상 성공으로 답한다(가입자 명단이 새지 않도록).
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  // 인증 메일 재발송. 링크는 웹앱(app.mysubflow.app)으로 열린다.
  resendVerification: () => api.post('/auth/verify-email/resend'),
};

// ── Subscriptions ──
export const subscriptionAPI = {
  getAll: () => api.get('/subscriptions'),
  getById: (id: string) => api.get(`/subscriptions/${id}`),
  create: (data: Record<string, unknown>) => api.post('/subscriptions', data),
  createFromCatalog: (data: {
    service_id: number;
    plan_id: number;
    start_date: string;
    next_billing_date: string;
    status?: string;
    auto_renew?: boolean;
    is_recurring?: boolean;
    member_count?: number;
  }) => api.post('/subscriptions/from-catalog', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/subscriptions/${id}`, data),
  cancel: (id: string) => api.delete(`/subscriptions/${id}`),
  applySuggestion: (id: string, data: { action_type: 'downgrade' | 'cancel' | 'switch_billing'; target_plan_id?: number }) =>
    api.post(`/subscriptions/${id}/apply-suggestion`, data),
  getUpcoming: () => api.get('/subscriptions/upcoming'),
  getCalendarEvents: (year: number, month: number) =>
    api.get(`/subscriptions/calendar-events?year=${year}&month=${month}`),
  getTimeline: () => api.get('/subscriptions/timeline'),
  getHistory: (id: string) => api.get(`/subscriptions/${id}/history`),
  // CSV 내보내기 — 텍스트 본문 그대로 받아 공유 시트로 전달
  exportCsv: () => api.get('/subscriptions/export', { responseType: 'text' }),
};

// ── Analytics ──
export const analyticsAPI = {
  getOverview: () => api.get('/analytics/overview'),
  getCategoryBreakdown: () => api.get('/analytics/category-breakdown'),
  getSpendingTrend: (months = 6) => api.get(`/analytics/spending-trend?months=${months}`),
  getOverlaps: () => api.get('/analytics/overlaps'),
  getExchangeRateAlerts: () => api.get('/analytics/exchange-rate-alerts'),
  getExchangeRates: () => api.get('/analytics/exchange-rates'),
  getTrials: () => api.get('/analytics/trials'),
  getSavingsSuggestions: () => api.get('/analytics/savings-suggestions'),
  getPriceChanges: () => api.get('/analytics/price-changes'),
  getBudgetStatus: () => api.get('/analytics/budget-status'),
};

// ── Services catalog ──
export const servicesAPI = {
  getAll: () => api.get('/services'),
  getPopular: () => api.get('/services/popular'),
  search: (q: string) => api.get(`/services/search?q=${q}`),
  getById: (id: number) => api.get(`/services/${id}`),
  // 카탈로그에 없는 서비스를 직접 등록한다. 등록한 사람에게만 보인다.
  create: (data: {
    name: string;
    description?: string;
    category_id?: number;
    website_url?: string;
    plans?: { name: string; price: number; currency: string; billing_cycle: string }[];
  }) => api.post('/services', data),
  remove: (id: number) => api.delete(`/services/${id}`),
  // 카탈로그에 없는 요금제를 직접 넣는다. 넣은 사람에게만 보인다.
  createPlan: (
    serviceId: number,
    data: {
      name: string;
      price: number;
      currency: string;
      billing_cycle: string;
      description?: string;
    },
  ) => api.post(`/services/${serviceId}/plans`, data),
  removePlan: (serviceId: number, planId: number) =>
    api.delete(`/services/${serviceId}/plans/${planId}`),
};

// ── Categories ──
// 기본 13종은 모두가 공유하고, 사용자가 만든 것은 만든 사람에게만 내려온다.
export const categoriesAPI = {
  getAll: () => api.get('/categories'),
  create: (data: { name: string; icon?: string; color?: string }) => api.post('/categories', data),
  remove: (id: number) => api.delete(`/categories/${id}`),
};

// ── Feedback (오류 신고·의견) ──
export const feedbackAPI = {
  send: (data: {
    type: 'bug' | 'suggestion' | 'other';
    message: string;
    client?: Record<string, string>;
    screenshot?: { filename: string; content_base64: string } | null;
  }) => api.post('/feedback', data),
};

// ── News (카드뉴스: AI 소식 + 구독료 알림) ──
export const newsAPI = {
  getNews: () => api.get('/news/'),
  // 개별 카드 열 때 헤드라인 기반 AI 요약을 온디맨드로 요청
  getSummary: (item: { title: string; link: string; source?: string; category?: string }) =>
    api.post('/news/summary', {
      title: item.title,
      link: item.link,
      source: item.source ?? '',
      category: item.category ?? '',
    }),
};

// ── Notifications ──
export const notificationAPI = {
  getSettings: () => api.get('/notifications/settings'),
  updateSettings: (settings: Record<string, unknown>) =>
    api.put('/notifications/settings', settings),
  getUpcoming: () => api.get('/notifications/upcoming'),
  // 인박스
  getInbox: (unreadOnly = false) =>
    api.get(`/notifications/inbox?unread_only=${unreadOnly}`),
  markRead: (id: string) => api.post(`/notifications/inbox/${id}/read`),
  markAllRead: () => api.post('/notifications/inbox/read-all'),
  dismiss: (id: string) => api.delete(`/notifications/inbox/${id}`),
  registerPushToken: (push_token: string) =>
    api.put('/notifications/push-token', { push_token }),
};
