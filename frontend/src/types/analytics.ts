export interface DashboardOverview {
  total_active_subscriptions: number;
  total_monthly_cost: number;
  total_yearly_cost: number;
  currency: string;
  next_renewal: {
    service_name: string;
    next_billing_date: string;
    cost: number;
  } | null;
  most_expensive: {
    service_name: string;
    monthly_cost: number;
  } | null;
}

export interface CategoryBreakdownItem {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

export interface CategoryBreakdown {
  year: number;
  month: number;
  breakdown: CategoryBreakdownItem[];
  total: number;
}

export interface MonthlyTotal {
  year: number;
  month: number;
  total: number;
  is_forecast?: boolean;
}

export interface SpendingTrend {
  data: MonthlyTotal[];
}

// Feature 1: Overlap Detection
export interface OverlapItem {
  category: string;
  category_icon?: string;
  services: string[];
  total_monthly_cost: number;
  message: string;
}
export interface OverlapDetectionResponse {
  overlaps: OverlapItem[];
}

// Feature 2: Exchange Rate Alert
export interface ExchangeRateAlertItem {
  subscription_id: string;
  service_name: string;
  currency: string;
  initial_rate: number;
  current_rate: number;
  change_percentage: number;
  initial_monthly_krw: number;
  current_monthly_krw: number;
  extra_cost_krw: number;
}
export interface ExchangeRateAlertResponse {
  alerts: ExchangeRateAlertItem[];
  current_usd_krw?: number;
}

// Feature 3: Trial Tracking
export interface TrialSubscriptionItem {
  id: string;
  service_name: string;
  logo_url?: string;
  category_name?: string;
  trial_end_date: string;
  days_remaining: number;
  cost_after_trial: number;
  currency: string;
  cost_after_trial_krw: number;
}
export interface TrialTrackingResponse {
  trials: TrialSubscriptionItem[];
  total_count: number;
}

// Feature 4: Savings Suggestions
export interface CheaperPlanInfo {
  plan_id: number;
  plan_name: string;
  price: number;
  currency: string;
  billing_cycle: string;
  monthly_cost_krw: number;
}
export interface SavingSuggestionItem {
  subscription_id: string;
  service_name: string;
  logo_url?: string;
  current_plan_name?: string;
  current_monthly_krw: number;
  cheaper_plans: CheaperPlanInfo[];
  max_savings_krw: number;
  suggestion_text: string;
}
export interface SavingsSuggestionsResponse {
  suggestions: SavingSuggestionItem[];
  total_potential_savings_krw: number;
}

// Feature 5: Price Change Alert
export interface PriceChangeAlertItem {
  subscription_id: string;
  service_name: string;
  logo_url?: string;
  plan_name: string;
  currency: string;
  old_price: number;
  new_price: number;
  change_amount: number;
  change_percentage: number;
  effective_date: string;
}
export interface PriceChangeAlertResponse {
  alerts: PriceChangeAlertItem[];
}

// Feature 6: Budget Status
export interface BudgetChargeItem {
  service_name: string;
  amount: number;
  billing_cycle: string;
  billing_date: string;
}

export interface BudgetStatus {
  budget_monthly: number | null;
  /** 이번 달에 실제로 빠져나가는 금액. 연간 구독을 12로 나누지 않는다. */
  current_spending: number;
  remaining: number | null;
  percentage_used: number | null;
  is_over_budget: boolean;
  /** 규모 비교용 월 평균(연간을 12로 나눈 값) */
  monthly_average: number;
  /** 이번 달에만 얹힌 연간·분기 결제 */
  irregular_charges: BudgetChargeItem[];
}
