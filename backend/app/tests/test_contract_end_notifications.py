"""약정 종료 알림(sync_contract_end_notifications) 테스트.

렌탈은 의무사용기간이 끝나면 소유권이 넘어오거나 렌탈료가 내려간다.
종료 30일 전부터 한 번만 알리고, 약정을 새로 잡으면 다시 알리는지를 고정한다.
"""

from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType
from app.models.subscription import BillingCycle, Subscription, SubscriptionStatus
from app.models.user import User
from app.services.notification_service import NotificationService


async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(email=email, hashed_password="x", username="contract")
    db.add(user)
    await db.flush()
    return user


async def _make_rental(
    db: AsyncSession,
    user_id: UUID,
    *,
    ends_in: int | None,
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
) -> Subscription:
    sub = Subscription(
        user_id=user_id,
        service_name="코웨이",
        cost=Decimal("29900"),
        currency="KRW",
        billing_cycle=BillingCycle.MONTHLY,
        start_date=date.today() - timedelta(days=1000),
        next_billing_date=date.today() + timedelta(days=10),
        status=status,
        contract_end_date=None if ends_in is None else date.today() + timedelta(days=ends_in),
    )
    db.add(sub)
    await db.flush()
    return sub


async def _contract_notes(db: AsyncSession, user_id: UUID) -> list[Notification]:
    rows = await db.execute(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.type == NotificationType.CONTRACT_END.value,
        )
    )
    return list(rows.scalars().all())


async def test_notifies_within_30_days(test_db: AsyncSession):
    user = await _make_user(test_db, "contract-soon@example.com")
    await _make_rental(test_db, user.id, ends_in=20)

    await NotificationService(test_db).sync_contract_end_notifications(user.id)

    notes = await _contract_notes(test_db, user.id)
    assert len(notes) == 1
    assert "코웨이" in notes[0].title
    assert "D-20" in notes[0].title


async def test_ignores_far_ended_and_no_contract(test_db: AsyncSession):
    """종료가 먼 약정, 약정이 없는 구독, 이미 끝난 약정은 알리지 않는다."""
    user = await _make_user(test_db, "contract-far@example.com")
    await _make_rental(test_db, user.id, ends_in=90)
    await _make_rental(test_db, user.id, ends_in=None)
    await _make_rental(test_db, user.id, ends_in=-1)

    await NotificationService(test_db).sync_contract_end_notifications(user.id)
    assert await _contract_notes(test_db, user.id) == []


async def test_ignores_cancelled(test_db: AsyncSession):
    user = await _make_user(test_db, "contract-cancel@example.com")
    await _make_rental(test_db, user.id, ends_in=5, status=SubscriptionStatus.CANCELLED)

    await NotificationService(test_db).sync_contract_end_notifications(user.id)
    assert await _contract_notes(test_db, user.id) == []


async def test_once_per_contract_and_again_after_renewal(test_db: AsyncSession):
    """같은 약정은 한 번만, 재약정으로 종료일이 바뀌면 다시 알린다."""
    user = await _make_user(test_db, "contract-once@example.com")
    sub = await _make_rental(test_db, user.id, ends_in=10)
    svc = NotificationService(test_db)

    await svc.sync_contract_end_notifications(user.id)
    await svc.sync_contract_end_notifications(user.id)
    assert len(await _contract_notes(test_db, user.id)) == 1

    sub.contract_end_date = date.today() + timedelta(days=25)
    await test_db.flush()
    await svc.sync_contract_end_notifications(user.id)
    assert len(await _contract_notes(test_db, user.id)) == 2
