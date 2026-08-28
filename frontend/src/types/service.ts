import type { Category } from "./category";
import type { BillingCycle } from "./subscription";

export interface ServicePlan {
  id: number;
  service_id: number;
  name: string;
  price: number;
  currency: string;
  billing_cycle: BillingCycle;
  description?: string;
  is_active: boolean;
  /** 내가 직접 넣은 요금제인지 (기본 카탈로그는 false) */
  is_custom?: boolean;
  /** 이 가격에 부가세가 들어 있는지. false면 결제 때 10%가 더 붙는다. */
  vat_included?: boolean;
}

export interface Service {
  id: number;
  name: string;
  description?: string;
  category_id?: number;
  category?: Category;
  logo_url?: string;
  website_url?: string;
  cancel_url?: string;
  is_popular: boolean;
  /** 내가 직접 등록한 서비스인지 (기본 카탈로그는 false) */
  is_custom?: boolean;
  created_at: string;
  plans: ServicePlan[];
  /** 검색 보조어 (한글/영문 표기 차이) */
  aliases?: string[];
}

/**
 * 구독에 딸려 오는 서비스 정보. 요금제 목록은 오지 않는다 —
 * 요금제는 사람마다 보이는 목록이 다르고(직접 넣은 요금제), 구독 화면은
 * 쓰지도 않아서 서버가 빼고 보낸다. 요금제가 필요하면 서비스 API를 부른다.
 */
export type ServiceBrief = Omit<Service, "plans" | "aliases">;

export interface PlanPriceHistory {
  price: number;
  currency: string;
  effective_date: string;
}

export interface ServiceListItem {
  id: number;
  name: string;
  description?: string;
  category_id?: number;
  category?: Category;
  logo_url?: string;
  website_url?: string;
  cancel_url?: string;
  is_popular: boolean;
  is_custom?: boolean;
  plan_count: number;
  min_price?: number;
  max_price?: number;
  currency?: string;
  plans: ServicePlan[];
}

export interface ServicePlanCreateRequest {
  name: string;
  price: number;
  currency: string;
  billing_cycle: BillingCycle;
  description?: string;
  /** 직접 넣는 금액은 대개 청구서에 찍힌 실결제액이라 기본이 포함가다. */
  vat_included?: boolean;
}

export interface ServiceCreateRequest {
  name: string;
  description?: string;
  category_id?: number;
  website_url?: string;
  cancel_url?: string;
  plans: ServicePlanCreateRequest[];
}
