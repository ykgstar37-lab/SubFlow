import csv
import io
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.subscription import BillingCycle, SubscriptionStatus
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User
from app.schemas.subscription import (
    ApplySuggestionRequest,
    CalendarEvent,
    CalendarEventsResponse,
    SubscriptionCreateRequest,
    SubscriptionFromCatalogRequest,
    SubscriptionHistoryItem,
    SubscriptionResponse,
    SubscriptionTimelineResponse,
    SubscriptionUpdateRequest,
)
from app.services.renewal_service import _add_months, _advance
from app.services.subscription_service import SubscriptionService

router = APIRouter()


@router.get("", response_model=list[SubscriptionResponse])
async def list_subscriptions(
    status_filter: SubscriptionStatus | None = Query(None, alias="status"),
    category_id: int | None = None,
    sort_by: str = "created_at",
    order: str = "desc",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SubscriptionService(db)
    return await service.get_all(current_user.id, status_filter, category_id, sort_by, order)


@router.post("/from-catalog", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_from_catalog(
    data: SubscriptionFromCatalogRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SubscriptionService(db)
    return await service.create_from_catalog(current_user.id, data)


@router.post("", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    data: SubscriptionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SubscriptionService(db)
    return await service.create(current_user.id, data)


@router.get("/upcoming", response_model=list[SubscriptionResponse])
async def upcoming_subscriptions(
    days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SubscriptionService(db)
    return await service.get_upcoming(current_user.id, days)


@router.get("/calendar-events", response_model=CalendarEventsResponse)
async def get_calendar_events(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all billing dates (past and future) for the current user's subscriptions."""
    service = SubscriptionService(db)
    # Get all subscriptions except cancelled
    all_subs = await service.get_all(current_user.id)
    today = date.today()
    events: list[CalendarEvent] = []

    for sub in all_subs:
        if sub.status == SubscriptionStatus.CANCELLED:
            continue

        category_name = sub.category.name if sub.category else None
        category_color = sub.category.color if sub.category else None

        # Generate past billing dates from start_date up to today
        current = sub.start_date
        while current <= today:
            events.append(
                CalendarEvent(
                    subscription_id=str(sub.id),
                    service_name=sub.service_name,
                    logo_url=sub.logo_url,
                    cost=Decimal(str(sub.cost)),
                    currency=sub.currency,
                    category_name=category_name,
                    category_color=category_color,
                    date=current.isoformat(),
                    is_past=True,
                    is_recurring=sub.is_recurring,
                )
            )
            if sub.billing_cycle == BillingCycle.MONTHLY:
                current += relativedelta(months=1)
            elif sub.billing_cycle == BillingCycle.YEARLY:
                current += relativedelta(years=1)
            elif sub.billing_cycle == BillingCycle.WEEKLY:
                current += timedelta(weeks=1)
            elif sub.billing_cycle == BillingCycle.QUARTERLY:
                current += relativedelta(months=3)
            else:
                break

        # 다음 결제일부터 주기만큼 밀며 12개월 앞까지 예정 결제를 만든다.
        # 갱신 작업과 같은 _advance를 써서 실제로 잡힐 날짜와 맞춘다.
        # 자동 갱신이 아니면 다음 결제일 한 번만 보인다.
        upcoming = sub.next_billing_date
        horizon = _add_months(today, 12)
        repeats = sub.auto_renew and sub.is_recurring
        while upcoming and upcoming <= horizon:
            if upcoming <= today:
                if not repeats:
                    break
                upcoming = _advance(upcoming, sub.billing_cycle)
                continue
            events.append(
                CalendarEvent(
                    subscription_id=str(sub.id),
                    service_name=sub.service_name,
                    logo_url=sub.logo_url,
                    cost=Decimal(str(sub.cost)),
                    currency=sub.currency,
                    category_name=category_name,
                    category_color=category_color,
                    date=upcoming.isoformat(),
                    is_past=False,
                    is_recurring=sub.is_recurring,
                )
            )
            if not repeats:
                break
            upcoming = _advance(upcoming, sub.billing_cycle)

    # Sort events by date
    events.sort(key=lambda e: e.date)
    return CalendarEventsResponse(events=events)


_CYCLE_LABELS_KO = {
    BillingCycle.MONTHLY: "월간",
    BillingCycle.YEARLY: "연간",
    BillingCycle.WEEKLY: "주간",
    BillingCycle.QUARTERLY: "분기",
}
_STATUS_LABELS_KO = {
    SubscriptionStatus.ACTIVE: "활성",
    SubscriptionStatus.PAUSED: "일시정지",
    SubscriptionStatus.CANCELLED: "취소됨",
    SubscriptionStatus.TRIAL: "체험판",
}


@router.get("/export")
async def export_subscriptions(
    status_filter: SubscriptionStatus | None = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """현재 사용자의 구독 목록을 CSV로 내보낸다 (Excel 호환, UTF-8 BOM)."""
    service = SubscriptionService(db)
    subs = await service.get_all(current_user.id, status_filter)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "서비스명", "카테고리", "비용", "통화", "결제주기",
        "분담인원", "1인당(내 몫)", "시작일", "다음결제일", "상태", "자동갱신", "메모",
    ])
    for s in subs:
        members = s.member_count or 1
        per_person = (Decimal(str(s.cost)) / members).quantize(Decimal("1"))
        writer.writerow([
            s.service_name,
            s.category.name if s.category else "미분류",
            f"{Decimal(str(s.cost)):.0f}",
            s.currency,
            _CYCLE_LABELS_KO.get(s.billing_cycle, s.billing_cycle.value),
            members,
            f"{per_person:.0f}",
            s.start_date.isoformat(),
            s.next_billing_date.isoformat(),
            _STATUS_LABELS_KO.get(s.status, s.status.value),
            "예" if s.auto_renew else "아니오",
            (s.notes or "").replace("\n", " "),
        ])

    # Excel에서 한글이 깨지지 않도록 UTF-8 BOM 포함
    csv_bytes = ("﻿" + buffer.getvalue()).encode("utf-8")
    filename = f"subflow_subscriptions_{date.today().isoformat()}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/timeline", response_model=SubscriptionTimelineResponse)
async def get_subscription_timeline(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all history events for the current user, sorted by created_at DESC."""
    result = await db.execute(
        select(SubscriptionHistory)
        .where(SubscriptionHistory.user_id == current_user.id)
        .order_by(SubscriptionHistory.created_at.desc())
    )
    histories = result.scalars().all()
    events = [
        SubscriptionHistoryItem(
            id=str(h.id),
            subscription_id=str(h.subscription_id),
            event_type=h.event_type,
            description=h.description,
            old_value=h.old_value,
            new_value=h.new_value,
            created_at=h.created_at.isoformat(),
        )
        for h in histories
    ]
    return SubscriptionTimelineResponse(events=events)


@router.get("/{subscription_id}/history", response_model=SubscriptionTimelineResponse)
async def get_subscription_history(
    subscription_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return history events for a specific subscription."""
    result = await db.execute(
        select(SubscriptionHistory)
        .where(
            SubscriptionHistory.subscription_id == subscription_id,
            SubscriptionHistory.user_id == current_user.id,
        )
        .order_by(SubscriptionHistory.created_at.desc())
    )
    histories = result.scalars().all()
    events = [
        SubscriptionHistoryItem(
            id=str(h.id),
            subscription_id=str(h.subscription_id),
            event_type=h.event_type,
            description=h.description,
            old_value=h.old_value,
            new_value=h.new_value,
            created_at=h.created_at.isoformat(),
        )
        for h in histories
    ]
    return SubscriptionTimelineResponse(events=events)


@router.get("/{subscription_id}", response_model=SubscriptionResponse)
async def get_subscription(
    subscription_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SubscriptionService(db)
    return await service.get_by_id(subscription_id, current_user.id)


@router.put("/{subscription_id}", response_model=SubscriptionResponse)
async def update_subscription(
    subscription_id: UUID,
    data: SubscriptionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SubscriptionService(db)
    return await service.update(subscription_id, current_user.id, data)


@router.delete("/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription(
    subscription_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SubscriptionService(db)
    await service.delete(subscription_id, current_user.id)


@router.post("/{subscription_id}/apply-suggestion", response_model=SubscriptionResponse)
async def apply_suggestion(
    subscription_id: UUID,
    data: ApplySuggestionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """절약 인사이트의 추천 액션을 구독에 적용한다.
    외부 서비스 자체는 사용자가 별도로 처리해야 하며, 이 호출은 우리 DB만 갱신한다."""
    service = SubscriptionService(db)
    return await service.apply_suggestion(
        subscription_id=subscription_id,
        user_id=current_user.id,
        action_type=data.action_type,
        target_plan_id=data.target_plan_id,
    )
