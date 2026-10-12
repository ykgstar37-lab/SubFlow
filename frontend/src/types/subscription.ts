import type { Category } from "./category";
import type { ServiceBrief, ServicePlan } from "./service";

export type BillingCycle = "monthly" | "yearly" | "weekly" | "quarterly";
export type SubscriptionStatus = "active" | "paused" | "cancelled" | "trial";

export interface Subscription {
  id: string;
  service_name: string;
  description?: string;
  cost: number;
  currency: string;
  billing_cycle: BillingCycle;
  billing_day?: number;
  start_date: string;
  next_billing_date: string;
  status: SubscriptionStatus;
  auto_renew: boolean;
  is_recurring: boolean;
  cancel_reminder: boolean;
  member_count: number;
  category_id?: number;
  category?: Category;
  service_id?: number;
  plan_id?: number;
  service?: ServiceBrief;
  plan?: ServicePlan;
  logo_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  /** 분담 반영 '내 몫'을 월 단위 KRW로 환산한 값. 대시보드 총액과 같은 기준. */
  monthly_cost_krw?: number;
  /** 이 구독 통화의 현재 환율(1 통화 = ? KRW). 원화 구독은 없음. */
  exchange_rate_krw?: number;
  /** 렌탈 등 약정 종료일. 없으면 약정 없음 */
  contract_end_date?: string | null;
  /** 렌탈 기기 종류("정수기")와 아이콘(이모지) */
  rental_item?: string | null;
  rental_item_icon?: string | null;
}

export interface SubscriptionCreateRequest {
  service_name: string;
  cost: number;
  currency?: string;
  billing_cycle: BillingCycle;
  billing_day?: number;
  start_date: string;
  next_billing_date: string;
  category_id?: number;
  status?: SubscriptionStatus;
  auto_renew?: boolean;
  is_recurring?: boolean;
  cancel_reminder?: boolean;
  member_count?: number;
  notes?: string;
  contract_end_date?: string | null;
  rental_item?: string | null;
  rental_item_icon?: string | null;
}

export type SubscriptionUpdateRequest = Partial<SubscriptionCreateRequest>;

export interface SubscriptionHistoryItem {
  id: string;
  subscription_id: string;
  event_type: "created" | "plan_changed" | "status_changed" | "price_changed" | "renewed";
  description: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
}

export interface CalendarEvent {
  subscription_id: string;
  service_name: string;
  logo_url?: string;
  cost: number;
  currency: string;
  category_name?: string;
  category_color?: string;
  date: string;
  is_past: boolean;
  is_recurring: boolean;
}
