from decimal import Decimal

from pydantic import BaseModel


class NextRenewalInfo(BaseModel):
    service_name: str
    next_billing_date: str
    cost: Decimal


class MostExpensiveInfo(BaseModel):
    service_name: str
    monthly_cost: Decimal


class DashboardOverview(BaseModel):
    total_active_subscriptions: int
    total_monthly_cost: Decimal
    total_yearly_cost: Decimal
    currency: str = "KRW"
    next_renewal: NextRenewalInfo | None = None
    most_expensive: MostExpensiveInfo | None = None


class CategoryBreakdownItem(BaseModel):
    category: str
    total: Decimal
    count: int
    percentage: float
    color: str | None = None
    icon: str | None = None


class CategoryBreakdown(BaseModel):
    year: int
    month: int
    breakdown: list[CategoryBreakdownItem]
    total: Decimal


class MonthlyTotal(BaseModel):
    year: int
    month: int
    total: Decimal
    is_forecast: bool = False


class SpendingTrend(BaseModel):
    data: list[MonthlyTotal]


# Feature 1: Overlap Detection
class OverlapService(BaseModel):
    """겹치는 구독 하나. 화면에서 바로 해지 페이지로 보내려면 주소가 필요하다."""

    subscription_id: str
    service_name: str
    monthly_cost_krw: Decimal
    cancel_url: str | None = None


class OverlapItem(BaseModel):
    category: str
    category_icon: str | None = None
    # 이름만 담은 예전 필드. 웹이 아직 이걸 쓰고 있어 그대로 둔다.
    services: list[str]
    # 해지 페이지로 보내려면 이름만으로는 부족해서 따로 싣는다.
    items: list[OverlapService] = []
    total_monthly_cost: Decimal
    message: str


class OverlapDetectionResponse(BaseModel):
    overlaps: list[OverlapItem]


# Feature 2: Exchange Rate Alert
class ExchangeRateAlertItem(BaseModel):
    subscription_id: str
    service_name: str
    currency: str
    initial_rate: Decimal
    current_rate: Decimal
    change_percentage: float
    initial_monthly_krw: Decimal
    current_monthly_krw: Decimal
    extra_cost_krw: Decimal


class ExchangeRatesResponse(BaseModel):
    """통화별 원화 환율 표. 1 <통화> = <값> KRW."""

    base: str = "KRW"
    rates: dict[str, Decimal]
    # 환율 기준일. Frankfurter(ECB 고시)는 영업일 1회 갱신이라 오늘 날짜가
    # 아닐 수 있다 — 화면에 "언제 기준"인지 밝히라고 같이 내려준다.
    as_of: str | None = None


class ExchangeRateAlertResponse(BaseModel):
    alerts: list[ExchangeRateAlertItem]
    current_usd_krw: Decimal | None = None


# Feature 3: Trial Tracking
class TrialSubscriptionItem(BaseModel):
    id: str
    service_name: str
    logo_url: str | None = None
    category_name: str | None = None
    trial_end_date: str
    days_remaining: int
    cost_after_trial: Decimal
    currency: str
    cost_after_trial_krw: Decimal


class TrialTrackingResponse(BaseModel):
    trials: list[TrialSubscriptionItem]
    total_count: int


# Feature 4: Savings Suggestions
class CheaperPlanInfo(BaseModel):
    plan_id: int
    plan_name: str
    price: Decimal
    currency: str
    billing_cycle: str
    monthly_cost_krw: Decimal


class SavingSuggestionItem(BaseModel):
    subscription_id: str
    service_name: str
    logo_url: str | None = None
    current_plan_name: str | None = None
    current_monthly_krw: Decimal
    cheaper_plans: list[CheaperPlanInfo]
    max_savings_krw: Decimal
    suggestion_text: str
    # ── 액션 가능 정보 ──
    action_type: str | None = None  # 'downgrade' | 'cancel' | 'switch_billing'
    action_url: str | None = None  # 외부 서비스 관리 페이지 URL
    target_plan_id: int | None = None  # downgrade/switch_billing 대상 plan


class SavingsSuggestionsResponse(BaseModel):
    suggestions: list[SavingSuggestionItem]
    total_potential_savings_krw: Decimal


# Feature 5: Price Change Alert
class PriceChangeAlertItem(BaseModel):
    subscription_id: str
    service_name: str
    logo_url: str | None = None
    plan_name: str
    currency: str
    old_price: Decimal
    new_price: Decimal
    change_amount: Decimal
    change_percentage: float
    effective_date: str


class PriceChangeAlertResponse(BaseModel):
    alerts: list[PriceChangeAlertItem]


# Feature 6: Budget Status
class BudgetStatusResponse(BaseModel):
    budget_monthly: int | None = None
    current_spending: Decimal
    remaining: Decimal | None = None
    percentage_used: float | None = None  # 0-100+
    is_over_budget: bool = False
