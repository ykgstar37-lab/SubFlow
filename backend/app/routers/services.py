from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, get_db
from app.models.category import Category
from app.models.plan_price_history import PlanPriceHistory
from app.models.service import Service
from app.models.service_plan import ServicePlan
from app.models.subscription import BillingCycle, Subscription
from app.models.user import User
from app.schemas.service import (
    PlanPriceHistoryResponse,
    ServiceCreateRequest,
    ServiceListResponse,
    ServicePlanCreateRequest,
    ServicePlanResponse,
    ServiceResponse,
)
from app.utils.service_aliases import aliases_for, matches
from app.utils.visibility import my_plans, only_visible_plans, visible_plans, visible_services

router = APIRouter()


def _visible_to(user: User):
    """기본 카탈로그(user_id IS NULL)와 내가 등록한 서비스만 보이게 하는 조건."""
    return visible_services(user.id)


def _to_list_item(service: Service, user_id: UUID) -> ServiceListResponse:
    """서비스 한 건을 목록 응답으로 옮긴다.

    목록·인기·검색 세 엔드포인트가 같은 모양을 만들어야 해서 한곳에 모았다.
    카드에 찍히는 가격 범위는 서로 비교되는 값이어야 한다. 통화가 섞이면 뜻이
    없으니 첫 요금제의 통화로 맞추고(지금 카탈로그는 서비스별로 통화가 하나),
    월간 요금제가 하나라도 있으면 그것만 쓴다. 월간과 연간을 한 범위에 넣으면
    "11,900~119,000원" 같은 값이 나와 읽는 사람이 열 배 비싼 요금제로 오해한다.
    연간 요금제는 시트를 열면 주기와 함께 그대로 보인다.
    """
    plans = my_plans(service, user_id)
    currency = plans[0].currency if plans else None
    same_currency = [p for p in plans if p.currency == currency]
    monthly = [p.price for p in same_currency if p.billing_cycle == BillingCycle.MONTHLY]
    comparable = monthly or [p.price for p in same_currency]

    return ServiceListResponse(
        id=service.id,
        name=service.name,
        description=service.description,
        category_id=service.category_id,
        category=service.category,
        logo_url=service.logo_url,
        website_url=service.website_url,
        cancel_url=service.cancel_url,
        is_popular=service.is_popular,
        is_custom=service.is_custom,
        plan_count=len(plans),
        min_price=min(comparable, default=None),
        max_price=max(comparable, default=None),
        currency=currency,
        plans=plans,
        aliases=aliases_for(service.name),
    )


def _to_detail(service: Service, user_id: UUID) -> ServiceResponse:
    """서비스 상세 응답. 요금제는 그 사람에게 보이는 것만 싣는다."""
    body = ServiceResponse.model_validate(service)
    body.plans = [ServicePlanResponse.model_validate(p) for p in my_plans(service, user_id)]
    return body


@router.get("", response_model=list[ServiceListResponse])
async def list_services(
    category_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Service).options(
        selectinload(Service.category),
        selectinload(Service.plans),
        only_visible_plans(current_user.id),
    ).where(_visible_to(current_user))
    if category_id:
        query = query.where(Service.category_id == category_id)
    query = query.order_by(Service.is_popular.desc(), Service.name)

    result = await db.execute(query)
    return [_to_list_item(s, current_user.id) for s in result.scalars().all()]


@router.get("/popular", response_model=list[ServiceListResponse])
async def popular_services(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Service)
        .options(selectinload(Service.category), selectinload(Service.plans), only_visible_plans(current_user.id))
        .where(Service.is_popular.is_(True), _visible_to(current_user))
        .order_by(Service.name)
    )
    return [_to_list_item(s, current_user.id) for s in result.scalars().all()]


@router.get("/search", response_model=list[ServiceListResponse])
async def search_services(
    q: str = Query(min_length=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 이름 LIKE만 걸면 '넷플릭스'로는 Netflix가 안 잡힌다. 별칭은 DB가 아니라
    # 앱 쪽 사전에 있으므로 전부 읽어 와서 이름+별칭으로 거른다(88종이라 부담 없다).
    result = await db.execute(
        select(Service)
        .options(selectinload(Service.category), selectinload(Service.plans), only_visible_plans(current_user.id))
        .where(_visible_to(current_user))
        .order_by(Service.name)
    )
    return [
        _to_list_item(s, current_user.id)
        for s in result.scalars().all()
        if matches(s.name, q)
    ]


@router.get("/{service_id}/price-history", response_model=dict[int, list[PlanPriceHistoryResponse]])
async def get_price_history(
    service_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """서비스의 모든 요금제 가격 변동 이력을 반환합니다."""
    result = await db.execute(
        select(PlanPriceHistory)
        .join(ServicePlan)
        .join(Service, Service.id == ServicePlan.service_id)
        .where(
            ServicePlan.service_id == service_id,
            _visible_to(current_user),
            visible_plans(current_user.id),
        )
        .order_by(PlanPriceHistory.effective_date)
    )
    rows = result.scalars().all()

    history: dict[int, list[PlanPriceHistoryResponse]] = {}
    for row in rows:
        history.setdefault(row.plan_id, []).append(
            PlanPriceHistoryResponse.model_validate(row)
        )
    return history


@router.get("/{service_id}", response_model=ServiceResponse)
async def get_service(
    service_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Service)
        .options(selectinload(Service.category), selectinload(Service.plans), only_visible_plans(current_user.id))
        .where(Service.id == service_id, _visible_to(current_user))
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    return _to_detail(service, current_user.id)


@router.post("", response_model=ServiceResponse, status_code=status.HTTP_201_CREATED)
async def create_service(
    data: ServiceCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """카탈로그에 없는 서비스를 직접 등록한다. 등록한 사람에게만 보인다."""
    existing = await db.execute(
        select(Service).where(Service.name == data.name, _visible_to(current_user))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Service already exists"
        )

    if data.category_id is not None:
        # 남의 카테고리에 내 서비스를 걸 수는 없다.
        category = await db.execute(
            select(Category).where(
                Category.id == data.category_id,
                or_(Category.user_id.is_(None), Category.user_id == current_user.id),
            )
        )
        if not category.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Category not found"
            )

    service = Service(
        name=data.name,
        description=data.description,
        category_id=data.category_id,
        website_url=data.website_url,
        cancel_url=data.cancel_url,
        is_popular=False,
        user_id=current_user.id,
    )
    db.add(service)
    await db.flush()

    for plan_data in data.plans:
        db.add(ServicePlan(service_id=service.id, user_id=current_user.id, **plan_data.model_dump()))

    await db.commit()

    result = await db.execute(
        select(Service)
        .options(selectinload(Service.category), selectinload(Service.plans), only_visible_plans(current_user.id))
        .where(Service.id == service.id)
    )
    return _to_detail(result.scalar_one(), current_user.id)


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service(
    service_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내가 등록한 서비스를 지운다. 기본 카탈로그는 지울 수 없다."""
    result = await db.execute(
        select(Service)
        .options(selectinload(Service.plans))
        .where(Service.id == service_id, Service.user_id == current_user.id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

    # 이 서비스로 등록해 둔 구독은 남긴다 — 이름·금액을 구독 쪽이 따로 들고 있어
    # 연결만 끊으면 화면은 그대로다. 여기서 같이 지우면 결제 이력까지 날아간다.
    plan_ids = [p.id for p in service.plans]
    await db.execute(
        update(Subscription)
        .where(Subscription.service_id == service_id)
        .values(service_id=None, plan_id=None)
    )
    if plan_ids:
        await db.execute(
            delete(PlanPriceHistory).where(PlanPriceHistory.plan_id.in_(plan_ids))
        )
    await db.delete(service)  # 요금제는 cascade로 함께 지워진다
    await db.commit()


@router.post(
    "/{service_id}/plans",
    response_model=ServicePlanResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_plan(
    service_id: int,
    data: ServicePlanCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """카탈로그에 없는 요금제를 직접 넣는다. 넣은 사람에게만 보인다.

    실제 요금제는 카탈로그가 따라갈 수 없을 만큼 많고 특가도 수시로 바뀐다.
    구독에 금액만 적어 두지 않고 진짜 요금제 행으로 남기는 이유는, plan_id가
    있어야 요금 인상 이력·절약 제안이 그 구독을 알아보기 때문이다.
    """
    service = await db.execute(
        select(Service).where(Service.id == service_id, _visible_to(current_user))
    )
    if not service.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

    # 같은 서비스 안에서 이름이 겹치면 고를 때 구분이 안 된다.
    existing = await db.execute(
        select(ServicePlan).where(
            ServicePlan.service_id == service_id,
            ServicePlan.name == data.name,
            visible_plans(current_user.id),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Plan already exists"
        )

    plan = ServicePlan(service_id=service_id, user_id=current_user.id, **data.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/{service_id}/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    service_id: int,
    plan_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내가 넣은 요금제를 지운다. 기본 카탈로그 요금제는 지울 수 없다."""
    result = await db.execute(
        select(ServicePlan).where(
            ServicePlan.id == plan_id,
            ServicePlan.service_id == service_id,
            ServicePlan.user_id == current_user.id,
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    # 서비스를 지울 때와 같다 — 이 요금제로 등록한 구독은 남기고 연결만 끊는다.
    # 금액·주기를 구독이 따로 들고 있어 화면은 그대로다.
    await db.execute(
        update(Subscription).where(Subscription.plan_id == plan_id).values(plan_id=None)
    )
    await db.execute(delete(PlanPriceHistory).where(PlanPriceHistory.plan_id == plan_id))
    await db.delete(plan)
    await db.commit()
