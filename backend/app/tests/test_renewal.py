"""Tests for the auto-renewal + payment-history service (renewal_service)."""

import uuid
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment_history import PaymentHistory
from app.models.subscription import BillingCycle, Subscription, SubscriptionStatus
from app.models.subscription_history import HistoryEventType, SubscriptionHistory
from app.models.user import User
from app.services.renewal_service import (
    _add_months,
    renew_due_subscriptions,
)

pytestmark = pytest.mark.asyncio


async def _make_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"renew-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        username="renew",
    )
    db.add(user)
    await db.flush()
    return user


def _sub(user_id, **kw) -> Subscription:
    defaults = dict(
        id=uuid.uuid4(),
        user_id=user_id,
        service_name="Test",
        cost=10000,
        currency="KRW",
        billing_cycle=BillingCycle.MONTHLY,
        start_date=date(2025, 1, 1),
        status=SubscriptionStatus.ACTIVE,
        auto_renew=True,
        is_recurring=True,
    )
    defaults.update(kw)
    return Subscription(**defaults)


# ---------------------------------------------------------------------------
# Pure date arithmetic
# ---------------------------------------------------------------------------


def test_add_months_clamps_month_end():
    assert _add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert _add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)  # leap
    assert _add_months(date(2026, 11, 30), 3) == date(2027, 2, 28)
    assert _add_months(date(2026, 12, 15), 1) == date(2027, 1, 15)  # year rollover


# ---------------------------------------------------------------------------
# Renewal behaviour
# ---------------------------------------------------------------------------


async def test_single_overdue_period_records_one_payment(test_db: AsyncSession):
    user = await _make_user(test_db)
    today = date.today()
    prev = _add_months(today, -1)  # one full cycle in the past
    sub = _sub(user.id, cost=13900, next_billing_date=prev, billing_cycle=BillingCycle.MONTHLY)
    test_db.add(sub)
    await test_db.commit()

    recorded = await renew_due_subscriptions(test_db)

    assert recorded == 1
    payments = (await test_db.execute(select(PaymentHistory))).scalars().all()
    assert len(payments) == 1
    assert float(payments[0].amount) == 13900.0
    assert payments[0].paid_at == prev
    # advanced to the next cycle, now in the future (or today)
    await test_db.refresh(sub)
    assert sub.next_billing_date == _add_months(prev, 1)
    assert sub.next_billing_date >= today


async def test_multiple_missed_periods_record_each(test_db: AsyncSession):
    user = await _make_user(test_db)
    today = date.today()
    start = _add_months(today, -3)  # three cycles behind
    sub = _sub(user.id, next_billing_date=start, billing_cycle=BillingCycle.MONTHLY)
    test_db.add(sub)
    await test_db.commit()

    # 밀린 주기 수를 3으로 박아 두면 말일에 깨진다 — 31일에서 세 달을 빼면
    # 5/31이고, 거기서 한 달씩 더하면 6/30 → 7/30 → 8/30이라 오늘(8/31)까지
    # 네 번 돌기 때문이다. 말일 보정을 그대로 두고 기대값을 함께 센다.
    expected, cursor = 0, start
    while cursor < today:
        cursor = _add_months(cursor, 1)
        expected += 1
    assert expected >= 3, "세 주기 이상 밀린 상황이어야 이 테스트가 뜻이 있다"

    recorded = await renew_due_subscriptions(test_db)

    assert recorded == expected
    await test_db.refresh(sub)
    assert sub.next_billing_date >= today
    # a single RENEWED history event summarising the catch-up
    events = (await test_db.execute(select(SubscriptionHistory))).scalars().all()
    assert len(events) == 1
    assert events[0].event_type == HistoryEventType.RENEWED


async def test_not_due_is_untouched(test_db: AsyncSession):
    user = await _make_user(test_db)
    future = _add_months(date.today(), 1)
    sub = _sub(user.id, next_billing_date=future)
    test_db.add(sub)
    await test_db.commit()

    recorded = await renew_due_subscriptions(test_db)

    assert recorded == 0
    await test_db.refresh(sub)
    assert sub.next_billing_date == future


async def test_auto_renew_off_is_skipped(test_db: AsyncSession):
    user = await _make_user(test_db)
    past = _add_months(date.today(), -1)
    sub = _sub(user.id, next_billing_date=past, auto_renew=False)
    test_db.add(sub)
    await test_db.commit()

    recorded = await renew_due_subscriptions(test_db)

    assert recorded == 0
    await test_db.refresh(sub)
    assert sub.next_billing_date == past  # unchanged


async def test_cancelled_is_skipped(test_db: AsyncSession):
    user = await _make_user(test_db)
    past = _add_months(date.today(), -1)
    sub = _sub(user.id, next_billing_date=past, status=SubscriptionStatus.CANCELLED)
    test_db.add(sub)
    await test_db.commit()

    recorded = await renew_due_subscriptions(test_db)

    assert recorded == 0
