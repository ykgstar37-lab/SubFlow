from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.subscription import BillingCycle, SubscriptionStatus
from app.schemas.category import CategoryResponse
from app.schemas.service import ServiceBriefResponse, ServicePlanResponse


class CalendarEvent(BaseModel):
    subscription_id: str
    service_name: str
    logo_url: str | None = None
    cost: Decimal
    currency: str
    category_name: str | None = None
    category_color: str | None = None
    date: str  # ISO date
    is_past: bool
    is_recurring: bool


class CalendarEventsResponse(BaseModel):
    events: list[CalendarEvent]


class SubscriptionFromCatalogRequest(BaseModel):
    """카탈로그에서 서비스 선택으로 구독 생성"""
    service_id: int
    plan_id: int
    start_date: date
    next_billing_date: date
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE
    auto_renew: bool = True
    notes: str | None = None
    is_recurring: bool = True
    cancel_reminder: bool = False
    member_count: int = Field(default=1, ge=1, le=50)


class SubscriptionCreateRequest(BaseModel):
    """수동 구독 생성 (커스텀)"""
    service_name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    cost: Decimal = Field(gt=0)
    currency: str = "KRW"
    billing_cycle: BillingCycle
    billing_day: int | None = Field(default=None, ge=1, le=31)
    start_date: date
    next_billing_date: date
    category_id: int | None = None
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE
    auto_renew: bool = True
    logo_url: str | None = None
    notes: str | None = None
    is_recurring: bool = True
    cancel_reminder: bool = False
    member_count: int = Field(default=1, ge=1, le=50)


class SubscriptionUpdateRequest(BaseModel):
    service_name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    cost: Decimal | None = Field(default=None, gt=0)
    currency: str | None = None
    billing_cycle: BillingCycle | None = None
    billing_day: int | None = Field(default=None, ge=1, le=31)
    start_date: date | None = None
    next_billing_date: date | None = None
    category_id: int | None = None
    status: SubscriptionStatus | None = None
    auto_renew: bool | None = None
    logo_url: str | None = None
    notes: str | None = None
    plan_id: int | None = None
    is_recurring: bool | None = None
    cancel_reminder: bool | None = None
    member_count: int | None = Field(default=None, ge=1, le=50)


class SubscriptionResponse(BaseModel):
    id: UUID
    user_id: UUID
    service_name: str
    description: str | None
    cost: Decimal
    currency: str
    billing_cycle: BillingCycle
    billing_day: int | None
    start_date: date
    next_billing_date: date
    status: SubscriptionStatus
    auto_renew: bool
    is_recurring: bool
    cancel_reminder: bool
    member_count: int
    category_id: int | None
    category: CategoryResponse | None = None
    service_id: int | None = None
    plan_id: int | None = None
    service: ServiceBriefResponse | None = None
    plan: ServicePlanResponse | None = None
    logo_url: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    # 분담 인원까지 반영한 '내 몫'을 월 단위 KRW로 환산한 값.
    # 대시보드 총액(analytics/overview.total_monthly_cost)과 같은 기준이라
    # 클라이언트가 두 값을 그대로 나누면 지출 비중이 나온다. 통화가 섞이거나
    # 연간 결제인 구독을 클라이언트가 직접 환산하지 않도록 서버가 계산한다.
    monthly_cost_krw: Decimal | None = None
    # 이 구독 통화의 현재 환율 (1 통화 = ? KRW). KRW 구독은 None.
    # 클라이언트가 '화면에 띄운 금액'을 그대로 환산해 병기할 수 있게 준다
    # (월 구독료든 연간 요금제든 표시 중인 값에 곱하기만 하면 된다).
    exchange_rate_krw: Decimal | None = None

    model_config = {"from_attributes": True}


class SubscriptionHistoryItem(BaseModel):
    id: str
    subscription_id: str
    event_type: str
    description: str
    old_value: str | None = None
    new_value: str | None = None
    created_at: str


class SubscriptionTimelineResponse(BaseModel):
    events: list[SubscriptionHistoryItem]


class ApplySuggestionRequest(BaseModel):
    """절약 인사이트 적용 요청. downgrade/cancel/switch_billing 중 하나."""
    action_type: str = Field(pattern="^(downgrade|cancel|switch_billing)$")
    target_plan_id: int | None = None
