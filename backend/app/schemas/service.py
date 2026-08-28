from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.subscription import BillingCycle
from app.schemas.category import CategoryResponse


class PlanPriceHistoryResponse(BaseModel):
    price: Decimal
    currency: str
    effective_date: date

    model_config = {"from_attributes": True}


class ServicePlanResponse(BaseModel):
    id: int
    service_id: int
    name: str
    price: Decimal
    currency: str
    billing_cycle: BillingCycle
    description: str | None
    is_active: bool
    # 내가 직접 넣은 요금제인지. 지우기 버튼과 "직접 입력" 표시를 이 값으로 가른다.
    is_custom: bool = False
    # 이 가격에 부가세가 들어 있는지. 별도면 화면에 '+VAT'를 붙이고
    # 담을 때 10%를 얹는다.
    vat_included: bool = True

    model_config = {"from_attributes": True}


class ServiceResponse(BaseModel):
    id: int
    name: str
    description: str | None
    category_id: int | None
    category: CategoryResponse | None = None
    logo_url: str | None
    website_url: str | None
    cancel_url: str | None = None
    is_popular: bool
    created_at: datetime
    # 내가 직접 등록한 서비스인지. 지우기 버튼을 이 값으로 가른다.
    is_custom: bool = False
    plans: list[ServicePlanResponse] = []

    model_config = {"from_attributes": True}


class ServiceBriefResponse(BaseModel):
    """구독 응답에 딸려 나가는 서비스 정보.

    요금제 목록은 넣지 않는다. 구독 화면은 서비스 이름·로고만 쓰고,
    요금제는 사람마다 보이는 목록이 다르다(직접 넣은 요금제는 그 사람 것).
    구독마다 요금제 전부를 실어 보내면 목록 응답만 무거워진다.
    """

    id: int
    name: str
    description: str | None
    category_id: int | None
    category: CategoryResponse | None = None
    logo_url: str | None
    website_url: str | None
    cancel_url: str | None = None
    is_popular: bool
    created_at: datetime
    is_custom: bool = False

    model_config = {"from_attributes": True}


class ServiceListResponse(BaseModel):
    id: int
    name: str
    description: str | None
    category_id: int | None
    category: CategoryResponse | None = None
    logo_url: str | None
    website_url: str | None = None
    cancel_url: str | None = None
    is_popular: bool
    is_custom: bool = False
    plan_count: int = 0
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    currency: str | None = None
    # 카탈로그 화면은 요금제를 눌러 고르는 게 목적이라, 목록만 받아 놓고 상세를
    # 다시 부르면 시트를 열 때마다 빈 화면이 뜬다. 88종 전부 실어도 수십 KB다.
    plans: list[ServicePlanResponse] = []
    # 한글/영문 표기가 서로 다른 서비스를 찾기 위한 검색 보조어.
    # 클라이언트도 목록을 손에 쥔 채 거르므로 함께 내려준다.
    aliases: list[str] = []

    model_config = {"from_attributes": True}


class ServicePlanCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price: Decimal = Field(ge=0)
    currency: str = Field(default="KRW", min_length=3, max_length=3)
    billing_cycle: BillingCycle = BillingCycle.MONTHLY
    description: str | None = None
    # 사람이 직접 넣는 금액은 대개 청구서에 찍힌 실결제액이라 포함가로 본다.
    vat_included: bool = True


class ServiceCreateRequest(BaseModel):
    """사용자가 직접 등록하는 서비스.

    요금제를 하나도 안 넣으면 카탈로그 카드에 가격이 안 뜨고 구독 등록도
    막히므로, 화면에서는 요금제 한 줄을 기본으로 채워 보낸다.
    """

    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    category_id: int | None = None
    website_url: str | None = Field(default=None, max_length=500)
    cancel_url: str | None = Field(default=None, max_length=500)
    plans: list[ServicePlanCreateRequest] = Field(default_factory=list, max_length=10)
