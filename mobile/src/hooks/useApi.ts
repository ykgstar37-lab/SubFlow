import { useState, useEffect, useCallback } from 'react';
import { subscriptionAPI, analyticsAPI, servicesAPI, categoriesAPI, notificationAPI, newsAPI } from '../services/api';

function useFetch<T>(fetcher: () => Promise<{ data: T }>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Error');
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}

// ── Subscriptions ──
export function useSubscriptions() {
  return useFetch(() => subscriptionAPI.getAll());
}

export function useUpcomingSubscriptions() {
  return useFetch(() => subscriptionAPI.getUpcoming());
}

export function useCalendarEvents(year: number, month: number) {
  return useFetch(() => subscriptionAPI.getCalendarEvents(year, month), [year, month]);
}

export function useTimeline() {
  return useFetch(() => subscriptionAPI.getTimeline());
}

// ── Analytics ──
export function useAnalyticsOverview() {
  return useFetch(() => analyticsAPI.getOverview());
}

export function useCategoryBreakdown() {
  return useFetch(() => analyticsAPI.getCategoryBreakdown());
}

export function useSpendingTrend(months = 6) {
  return useFetch(() => analyticsAPI.getSpendingTrend(months), [months]);
}

export function useSavingsSuggestions() {
  return useFetch(() => analyticsAPI.getSavingsSuggestions());
}

export function useBudgetStatus() {
  return useFetch(() => analyticsAPI.getBudgetStatus());
}

export function usePriceChanges() {
  return useFetch(() => analyticsAPI.getPriceChanges());
}

export function useOverlaps() {
  return useFetch(() => analyticsAPI.getOverlaps());
}

export function useExchangeRateAlerts() {
  return useFetch(() => analyticsAPI.getExchangeRateAlerts());
}

// ── Services (카탈로그) ──
export interface CatalogPlan {
  id: number;
  name: string;
  price: number | string;      // Decimal이 문자열로 넘어오는 경우가 있어 둘 다 받는다
  currency: string;
  billing_cycle: string;
  /** 내가 직접 넣은 요금제인지 (기본 카탈로그는 false) */
  is_custom?: boolean;
  /** 이 가격에 부가세가 들어 있는지. false면 결제 때 10%가 더 붙는다. */
  vat_included?: boolean;
}

export interface CatalogService {
  id: number;
  name: string;
  description: string | null;
  category_id: number | null;
  category: { id: number; name: string; icon: string | null; color: string | null } | null;
  logo_url: string | null;
  website_url: string | null;
  cancel_url: string | null;
  is_popular: boolean;
  /** 내가 직접 등록한 서비스인지 (기본 카탈로그는 false) */
  is_custom?: boolean;
  plan_count: number;
  min_price: number | string | null;
  max_price: number | string | null;
  currency: string | null;
  plans: CatalogPlan[];
  aliases?: string[];
}

export function useServices() {
  return useFetch<CatalogService[]>(() => servicesAPI.getAll());
}

export interface CatalogCategory {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  /** 내가 직접 만든 카테고리인지 (기본 13종은 false) */
  is_custom: boolean;
}

export function useCategories() {
  return useFetch<CatalogCategory[]>(() => categoriesAPI.getAll());
}

// ── News (카드뉴스) ──
export interface NewsItem {
  title: string;
  link: string;
  pub_date: string;
  source: string;
  image_url: string | null;
  category: string;      // "AI Updates" | "Price Alerts"
  matched?: boolean;     // 내 구독과 관련된 소식인지
}

export interface NewsResponse {
  items: NewsItem[];
}

export function useNews() {
  return useFetch<NewsResponse>(() => newsAPI.getNews());
}

// ── Notifications ──
export function useNotificationSettings() {
  return useFetch(() => notificationAPI.getSettings());
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  category?: string | null;
  link?: string | null;
  image_url?: string | null;
  action_url?: string | null;
  action_label?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface InboxData {
  items: NotificationItem[];
  unread_count: number;
}

export function useInbox() {
  return useFetch<InboxData>(() => notificationAPI.getInbox());
}
