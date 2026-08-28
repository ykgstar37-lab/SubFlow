from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.category import Category
from app.models.service import Service
from app.models.service_plan import ServicePlan
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.subscription_history import HistoryEventType, SubscriptionHistory
from app.schemas.subscription import SubscriptionCreateRequest, SubscriptionFromCatalogRequest, SubscriptionUpdateRequest
from app.utils.cost import to_monthly_cost_krw
from app.utils.exchange_rate import get_exchange_rates
from app.utils.visibility import visible_plans

# 구독 응답에 함께 실을 관계들. 서비스의 요금제 목록은 싣지 않는다 —
# 요금제는 사람마다 보이는 목록이 다르고(직접 넣은 요금제), 구독 화면은
# 쓰지도 않는다. 요금제 목록은 서비스 API에서 사람별로 걸러 내려준다.
EAGER_LOADS = [
    selectinload(Subscription.category),
    selectinload(Subscription.service).selectinload(Service.category),
    selectinload(Subscription.plan),
]


async def annotate_monthly_krw(subs: list[Subscription]) -> list[Subscription]:
    """응답에 실어 보낼 KRW 환산값을 ORM 인스턴스에 붙인다.

    SubscriptionResponse는 from_attributes로 직렬화되므로 인스턴스에 얹어 두면
    그대로 나간다. 환율은 1시간 캐시라 구독 수만큼 불러도 요청은 한 번뿐이다.
    - monthly_cost_krw: 총액(analytics/overview)과 같은 기준을 쓰려고
      personal_cost(분담 반영)를 월 단위 KRW로 환산한 값
    - exchange_rate_krw: 클라이언트가 화면의 임의 금액을 환산해 병기하도록
    """
    rates = await get_exchange_rates()
    for s in subs:
        s.monthly_cost_krw = await to_monthly_cost_krw(s.personal_cost, s.billing_cycle, s.currency)
        s.exchange_rate_krw = None if s.currency == "KRW" else rates.get(s.currency.upper())
    return subs


class SubscriptionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _record_history(
        self,
        subscription_id: UUID,
        user_id: UUID,
        event_type: HistoryEventType,
        description: str,
        old_value: str | None = None,
        new_value: str | None = None,
    ) -> None:
        history = SubscriptionHistory(
            subscription_id=subscription_id,
            user_id=user_id,
            event_type=event_type,
            description=description,
            old_value=old_value,
            new_value=new_value,
        )
        self.db.add(history)

    async def get_all(
        self,
        user_id: UUID,
        status_filter: SubscriptionStatus | None = None,
        category_id: int | None = None,
        sort_by: str = "created_at",
        order: str = "desc",
    ) -> list[Subscription]:
        query = select(Subscription).options(*EAGER_LOADS).where(Subscription.user_id == user_id)

        if status_filter:
            query = query.where(Subscription.status == status_filter)
        if category_id:
            query = query.where(Subscription.category_id == category_id)

        sort_column = getattr(Subscription, sort_by, Subscription.created_at)
        if order == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        result = await self.db.execute(query)
        return await annotate_monthly_krw(list(result.scalars().all()))

    async def get_by_id(self, subscription_id: UUID, user_id: UUID) -> Subscription:
        result = await self.db.execute(
            select(Subscription).options(*EAGER_LOADS)
            .where(Subscription.id == subscription_id, Subscription.user_id == user_id)
        )
        subscription = result.scalar_one_or_none()
        if not subscription:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
        return (await annotate_monthly_krw([subscription]))[0]

    async def _assert_category_visible(self, user_id: UUID, category_id: int | None) -> None:
        """내 것도 기본 카탈로그도 아닌 카테고리는 붙일 수 없다.

        구독 응답에는 카테고리 이름이 함께 나가므로, 막지 않으면 id를 넣어 보는
        것만으로 남이 만든 카테고리 이름을 읽어 낼 수 있다.
        """
        if category_id is None:
            return
        result = await self.db.execute(
            select(Category.id).where(
                Category.id == category_id,
                or_(Category.user_id.is_(None), Category.user_id == user_id),
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    async def create_from_catalog(self, user_id: UUID, data: SubscriptionFromCatalogRequest) -> Subscription:
        # Fetch service and plan (기본 카탈로그이거나 내가 등록한 것만)
        svc_result = await self.db.execute(
            select(Service).options(selectinload(Service.plans)).where(
                Service.id == data.service_id,
                or_(Service.user_id.is_(None), Service.user_id == user_id),
            )
        )
        service = svc_result.scalar_one_or_none()
        if not service:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

        plan_result = await self.db.execute(
            select(ServicePlan).where(
                ServicePlan.id == data.plan_id,
                ServicePlan.service_id == data.service_id,
                visible_plans(user_id),
            )
        )
        plan = plan_result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

        subscription = Subscription(
            user_id=user_id,
            service_id=service.id,
            plan_id=plan.id,
            service_name=service.name,
            description=f"{service.name} - {plan.name}",
            cost=plan.price,
            currency=plan.currency,
            billing_cycle=plan.billing_cycle,
            category_id=service.category_id,
            start_date=data.start_date,
            next_billing_date=data.next_billing_date,
            status=data.status,
            auto_renew=data.auto_renew,
            logo_url=service.logo_url,
            notes=data.notes,
            is_recurring=data.is_recurring,
            cancel_reminder=data.cancel_reminder,
            member_count=data.member_count,
        )
        if subscription.currency != "KRW":
            rates = await get_exchange_rates()
            subscription.initial_exchange_rate = rates.get(subscription.currency)
        self.db.add(subscription)
        await self.db.flush()

        await self._record_history(
            subscription_id=subscription.id,
            user_id=user_id,
            event_type=HistoryEventType.CREATED,
            description=f"{service.name} ({plan.name}) 구독을 시작했습니다",
        )
        await self.db.commit()

        result = await self.db.execute(
            select(Subscription).options(*EAGER_LOADS).where(Subscription.id == subscription.id)
        )
        return (await annotate_monthly_krw([result.scalar_one()]))[0]

    async def _infer_category_id(self, user_id: UUID, service_name: str) -> int | None:
        """이름이 같은 카탈로그 서비스의 카테고리를 물려받는다.

        분류를 따로 고르지 않았다면 우리가 정해 둔 카테고리를 따르는 게 맞다.
        직접 입력으로 "Netflix"를 적어도 서비스 탐색에서 고른 것과 같은 칸에
        들어가야, 카테고리별로 묶어 볼 때 같은 서비스가 둘로 갈라지지 않는다.
        """
        result = await self.db.execute(
            select(Service.category_id)
            .where(
                Service.name == service_name,
                or_(Service.user_id.is_(None), Service.user_id == user_id),
            )
            # 내가 등록한 것이 있으면 그쪽을 먼저 본다
            .order_by(Service.user_id.is_(None))
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def create(self, user_id: UUID, data: SubscriptionCreateRequest) -> Subscription:
        await self._assert_category_visible(user_id, data.category_id)
        subscription = Subscription(user_id=user_id, **data.model_dump())
        if subscription.category_id is None:
            subscription.category_id = await self._infer_category_id(user_id, subscription.service_name)
        if subscription.currency != "KRW":
            rates = await get_exchange_rates()
            subscription.initial_exchange_rate = rates.get(subscription.currency)
        self.db.add(subscription)
        await self.db.flush()

        await self._record_history(
            subscription_id=subscription.id,
            user_id=user_id,
            event_type=HistoryEventType.CREATED,
            description=f"{subscription.service_name} 구독을 시작했습니다",
        )
        await self.db.commit()

        result = await self.db.execute(
            select(Subscription).options(*EAGER_LOADS).where(Subscription.id == subscription.id)
        )
        return (await annotate_monthly_krw([result.scalar_one()]))[0]

    async def update(self, subscription_id: UUID, user_id: UUID, data: SubscriptionUpdateRequest) -> Subscription:
        subscription = await self.get_by_id(subscription_id, user_id)
        update_data = data.model_dump(exclude_unset=True)
        if "category_id" in update_data:
            await self._assert_category_visible(user_id, update_data["category_id"])

        # Detect changes and record history before applying updates
        if "status" in update_data and update_data["status"] != subscription.status:
            old_status = subscription.status.value if subscription.status else None
            new_status = update_data["status"].value if isinstance(update_data["status"], SubscriptionStatus) else update_data["status"]
            await self._record_history(
                subscription_id=subscription.id,
                user_id=user_id,
                event_type=HistoryEventType.STATUS_CHANGED,
                description=f"{old_status} → {new_status}",
                old_value=old_status,
                new_value=new_status,
            )

        if "cost" in update_data and Decimal(str(update_data["cost"])) != Decimal(str(subscription.cost)):
            old_cost = f"{subscription.cost:,.0f}원"
            new_cost = f"{Decimal(str(update_data['cost'])):,.0f}원"
            await self._record_history(
                subscription_id=subscription.id,
                user_id=user_id,
                event_type=HistoryEventType.PRICE_CHANGED,
                description=f"{old_cost} → {new_cost}",
                old_value=str(subscription.cost),
                new_value=str(update_data["cost"]),
            )

        if "plan_id" in update_data and update_data["plan_id"] != subscription.plan_id:
            old_plan_name = subscription.plan.name if subscription.plan else str(subscription.plan_id)
            # Fetch new plan name
            new_plan_name = str(update_data["plan_id"])
            if update_data["plan_id"] is not None:
                plan_result = await self.db.execute(
                    select(ServicePlan).where(
                        ServicePlan.id == update_data["plan_id"], visible_plans(user_id)
                    )
                )
                new_plan = plan_result.scalar_one_or_none()
                if new_plan:
                    new_plan_name = new_plan.name
            await self._record_history(
                subscription_id=subscription.id,
                user_id=user_id,
                event_type=HistoryEventType.PLAN_CHANGED,
                description=f"{old_plan_name} → {new_plan_name}",
                old_value=old_plan_name,
                new_value=new_plan_name,
            )

        for key, value in update_data.items():
            setattr(subscription, key, value)
        await self.db.commit()

        result = await self.db.execute(
            select(Subscription).options(*EAGER_LOADS).where(Subscription.id == subscription.id)
        )
        return (await annotate_monthly_krw([result.scalar_one()]))[0]

    async def apply_suggestion(
        self,
        subscription_id: UUID,
        user_id: UUID,
        action_type: str,
        target_plan_id: int | None,
    ) -> Subscription:
        """절약 인사이트의 액션을 구독에 적용한다.
        외부 서비스를 직접 조작하지는 못하므로, 우리 DB의 상태만 갱신한다."""
        subscription = await self.get_by_id(subscription_id, user_id)

        if action_type == "cancel":
            old_status = subscription.status.value if subscription.status else None
            subscription.status = SubscriptionStatus.CANCELLED
            await self._record_history(
                subscription_id=subscription.id,
                user_id=user_id,
                event_type=HistoryEventType.STATUS_CHANGED,
                description=f"{old_status} → cancelled",
                old_value=old_status,
                new_value="cancelled",
            )

        elif action_type in ("downgrade", "switch_billing"):
            if target_plan_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="target_plan_id is required for downgrade/switch_billing",
                )
            plan_result = await self.db.execute(
                select(ServicePlan).where(
                    ServicePlan.id == target_plan_id, visible_plans(user_id)
                )
            )
            new_plan = plan_result.scalar_one_or_none()
            if new_plan is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="target plan not found",
                )

            old_plan_name = subscription.plan.name if subscription.plan else str(subscription.plan_id)
            old_cost = subscription.cost
            await self._record_history(
                subscription_id=subscription.id,
                user_id=user_id,
                event_type=HistoryEventType.PLAN_CHANGED,
                description=f"{old_plan_name} → {new_plan.name}",
                old_value=old_plan_name,
                new_value=new_plan.name,
            )
            if Decimal(str(old_cost)) != Decimal(str(new_plan.price)):
                await self._record_history(
                    subscription_id=subscription.id,
                    user_id=user_id,
                    event_type=HistoryEventType.PRICE_CHANGED,
                    description=f"{old_cost:,.0f}{subscription.currency} → {new_plan.price:,.0f}{new_plan.currency}",
                    old_value=str(old_cost),
                    new_value=str(new_plan.price),
                )

            subscription.plan_id = new_plan.id
            subscription.cost = new_plan.price
            subscription.currency = new_plan.currency
            subscription.billing_cycle = new_plan.billing_cycle

        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"unknown action_type: {action_type}",
            )

        await self.db.commit()
        result = await self.db.execute(
            select(Subscription).options(*EAGER_LOADS).where(Subscription.id == subscription.id)
        )
        return (await annotate_monthly_krw([result.scalar_one()]))[0]

    async def delete(self, subscription_id: UUID, user_id: UUID) -> None:
        subscription = await self.get_by_id(subscription_id, user_id)

        await self._record_history(
            subscription_id=subscription.id,
            user_id=user_id,
            event_type=HistoryEventType.STATUS_CHANGED,
            description=f"{subscription.service_name} 구독을 해지했습니다",
            old_value=subscription.status.value if subscription.status else None,
            new_value="cancelled",
        )
        await self.db.flush()

        await self.db.delete(subscription)
        await self.db.commit()

    async def get_upcoming(self, user_id: UUID, days: int = 7) -> list[Subscription]:
        from datetime import timedelta
        today = date.today()
        end_date = today + timedelta(days=days)
        result = await self.db.execute(
            select(Subscription).options(*EAGER_LOADS)
            .where(
                Subscription.user_id == user_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.next_billing_date >= today,
                Subscription.next_billing_date <= end_date,
            )
            .order_by(Subscription.next_billing_date.asc())
        )
        return await annotate_monthly_krw(list(result.scalars().all()))
