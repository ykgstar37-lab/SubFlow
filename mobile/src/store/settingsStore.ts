import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Language } from '../i18n/translations';
import { notificationAPI } from '../services/api';

interface SettingsState {
  language: Language;
  currency: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  daysBefore: number;
  monthlyBudget: number | null;
  budgetAlerts: boolean;
  fxAlerts: boolean;

  setLanguage: (lang: Language) => Promise<void>;
  setCurrency: (currency: string) => Promise<void>;
  setPushEnabled: (enabled: boolean) => void;
  setEmailEnabled: (enabled: boolean) => void;
  setDaysBefore: (days: number) => void;
  setMonthlyBudget: (budget: number | null) => void;
  setBudgetAlerts: (enabled: boolean) => void;
  setFxAlerts: (enabled: boolean) => void;
  loadSettings: () => Promise<void>;
  /** 알림 설정을 서버에서 받아 온다. 웹에서 바꾼 값이 앱에도 그대로 보이도록. */
  syncFromServer: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  // 한국어가 기본. 사용자가 설정에서 바꾸면 AsyncStorage에 저장된다.
  language: 'ko',
  currency: 'KRW',
  // 서버 기본값과 같게 둔다. 서버를 읽기 전 잠깐 보이는 값이라도
  // 실제와 다르면 사용자는 켜져 있다고 믿고 알림을 기다리게 된다.
  pushEnabled: false,
  emailEnabled: true,
  daysBefore: 3,
  monthlyBudget: null,
  budgetAlerts: true,
  fxAlerts: true,

  setLanguage: async (lang: Language) => {
    await AsyncStorage.setItem('language', lang);
    set({ language: lang });
  },

  setCurrency: async (currency: string) => {
    await AsyncStorage.setItem('currency', currency);
    set({ currency });
  },

  // 알림 설정과 예산은 계정에 딸린 값이라 서버가 원본이다(웹과 같은 값을 봐야 한다).
  // 화면은 먼저 바꿔 두고 서버에 보낸다 — 스위치가 굼뜨게 보이지 않도록.
  setPushEnabled: (enabled) => {
    set({ pushEnabled: enabled });
    notificationAPI.updateSettings({ push_notifications: enabled }).catch(() => {});
  },
  setEmailEnabled: (enabled) => {
    set({ emailEnabled: enabled });
    notificationAPI.updateSettings({ email_notifications: enabled }).catch(() => {});
  },
  setDaysBefore: (days) => {
    set({ daysBefore: days });
    notificationAPI.updateSettings({ notify_days_before: days }).catch(() => {});
  },
  setMonthlyBudget: (budget) => {
    set({ monthlyBudget: budget });
    notificationAPI.updateSettings({ budget_monthly: budget }).catch(() => {});
  },
  setBudgetAlerts: (enabled) => {
    set({ budgetAlerts: enabled });
    notificationAPI.updateSettings({ budget_alerts: enabled }).catch(() => {});
  },
  setFxAlerts: (enabled) => {
    set({ fxAlerts: enabled });
    notificationAPI.updateSettings({ fx_alerts: enabled }).catch(() => {});
  },

  syncFromServer: async () => {
    try {
      const res = await notificationAPI.getSettings();
      const d = res.data;
      set({
        pushEnabled: !!d.push_notifications,
        emailEnabled: !!d.email_notifications,
        daysBefore: d.notify_days_before ?? 3,
        monthlyBudget: d.budget_monthly ?? null,
        budgetAlerts: d.budget_alerts ?? true,
        fxAlerts: d.fx_alerts ?? true,
      });
    } catch {
      // 로그인 전이거나 오프라인 — 다음 기회에 다시 맞춘다
    }
  },

  /**
   * 기기에 붙는 설정만 읽는다. 언어와 표시 통화는 이 폰에서 어떻게 보고
   * 싶은지의 문제라 계정을 따라다닐 이유가 없다.
   *
   * 알림 설정과 예산은 여기서 읽지 않는다 — 예전에는 AsyncStorage에 따로
   * 담아 두어서 웹에서 바꾼 값과 화면이 갈렸다. 그쪽은 syncFromServer()가 맡는다.
   */
  loadSettings: async () => {
    const lang = await AsyncStorage.getItem('language');
    const curr = await AsyncStorage.getItem('currency');
    set({
      language: (lang as Language) || 'ko',
      currency: curr || 'KRW',
    });
  },
}));
