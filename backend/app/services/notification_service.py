from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import messages
from app.models.notification import Notification, NotificationType
from app.models.notification_setting import NotificationSetting
from app.models.subscription import Subscription, SubscriptionStatus
from app.schemas.notification import NotificationSettingsUpdateRequest
from app.services.subscription_service import annotate_monthly_krw


# 알림 설정이 아직 없는 사용자에게 쓰는 기본값 (모델 기본값과 같게 유지)
DEFAULT_NOTIFY_DAYS_BEFORE = 3


def _fmt_money(amount, currency: str) -> str:
    """금액을 통화에 맞게 적는다. 원·엔은 소수점 없이, 나머지는 둘째 자리까지."""
    n = float(amount)
    if currency in ("KRW", "JPY"):
        return f"{round(n):,}{'원' if currency == 'KRW' else '엔'}"
    symbol = {"USD": "$", "EUR": "€", "GBP": "£"}.get(currency, currency + " ")
    return f"{symbol}{n:,.2f}"


class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── 인박스 ─────────────────────────────────────────────
    async def list_inbox(
        self, user_id: UUID, unread_only: bool = False, limit: int = 50
    ) -> tuple[list[Notification], int]:
        """파생 알림을 최신화한 뒤 인박스 목록 + 안읽음 개수를 반환."""
        await self.sync_all_derived(user_id)

        stmt = select(Notification).where(
            Notification.user_id == user_id,
            Notification.is_archived.is_(False),
        )
        if unread_only:
            stmt = stmt.where(Notification.is_read.is_(False))
        stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)

        items = list((await self.db.execute(stmt)).scalars().all())
        unread = await self.get_unread_count(user_id)
        return items, unread

    async def get_unread_count(self, user_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_archived.is_(False),
                Notification.is_read.is_(False),
            )
        )
        return int(result.scalar_one())

    async def mark_read(self, user_id: UUID, notification_id: UUID) -> int:
        result = await self.db.execute(
            update(Notification)
            .where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
                Notification.is_read.is_(False),
            )
            .values(is_read=True, read_at=datetime.now(timezone.utc))
        )
        await self.db.commit()
        return result.rowcount or 0

    async def mark_all_read(self, user_id: UUID) -> int:
        result = await self.db.execute(
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_archived.is_(False),
                Notification.is_read.is_(False),
            )
            .values(is_read=True, read_at=datetime.now(timezone.utc))
        )
        await self.db.commit()
        return result.rowcount or 0

    async def archive(self, user_id: UUID, notification_id: UUID) -> int:
        result = await self.db.execute(
            update(Notification)
            .where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
                Notification.is_archived.is_(False),
            )
            .values(is_archived=True)
        )
        await self.db.commit()
        return result.rowcount or 0

    async def sync_overlap_notifications(self, user_id: UUID) -> None:
        """카테고리 중복 탐지 결과를 알림으로 승격.
        - 새 중복 → 알림 생성 (dedup_key로 중복 삽입 방지)
        - 기존 중복 지속 → 내용 갱신 (사용자가 닫은 알림은 건드리지 않음)
        - 해소된 중복 → 자동 보관(archive)
        """
        # 순환 import 방지: 메서드 내부에서 import
        from app.services.analytics_service import AnalyticsService

        overlaps = (await AnalyticsService(self.db).detect_overlaps(user_id)).overlaps
        current_keys = {f"overlap:{o.category}" for o in overlaps}

        # 기존 overlap 알림 로드
        existing = list(
            (
                await self.db.execute(
                    select(Notification).where(
                        Notification.user_id == user_id,
                        Notification.type == NotificationType.OVERLAP.value,
                    )
                )
            )
            .scalars()
            .all()
        )
        by_key = {n.dedup_key: n for n in existing}

        for o in overlaps:
            key = f"overlap:{o.category}"
            title = messages.overlap_title(o.category, len(o.services))
            body = messages.overlap_body(", ".join(o.services), int(o.total_monthly_cost))
            note = by_key.get(key)
            if note is None:
                self.db.add(
                    Notification(
                        user_id=user_id,
                        type=NotificationType.OVERLAP.value,
                        title=title,
                        body=body,
                        category=messages.NOTIFICATION_CATEGORY,
                        link="/analytics",
                        dedup_key=key,
                    )
                )
            elif not note.is_archived:
                # 사용자가 닫지 않은 알림만 최신 내용으로 갱신
                note.title = title
                note.body = body

        # 더 이상 겹치지 않는 항목은 자동 보관
        for note in existing:
            if note.dedup_key not in current_keys and not note.is_archived:
                note.is_archived = True

        await self.db.commit()

    async def sync_price_change_notifications(self, user_id: UUID) -> None:
        """내 구독 요금제의 가격 변동을 개인화 알림으로 승격.
        가격 변동은 '이벤트'이므로 dedup_key에 발효일을 포함해 새 변동만 추가하고,
        지난 알림은 히스토리로 남긴다(자동 보관하지 않음).
        """
        from app.services.analytics_service import AnalyticsService

        alerts = (await AnalyticsService(self.db).get_price_change_alerts(user_id)).alerts
        if not alerts:
            return

        existing_keys = set(
            (
                await self.db.execute(
                    select(Notification.dedup_key).where(
                        Notification.user_id == user_id,
                        Notification.type == NotificationType.PRICE_CHANGE.value,
                    )
                )
            )
            .scalars()
            .all()
        )

        cancel_urls = await self._cancel_urls(user_id)

        for a in alerts:
            key = f"price_change:{a.subscription_id}:{a.effective_date}"
            if key in existing_keys:
                continue
            up = a.change_amount > 0
            pct = f"{'+' if up else ''}{a.change_percentage:.1f}%"
            title = messages.price_change_title(a.service_name, up)
            body = messages.price_change_body(
                a.plan_name,
                _fmt_money(a.old_price, a.currency),
                _fmt_money(a.new_price, a.currency),
                pct,
            )
            cancel_url = cancel_urls.get(a.subscription_id)
            self.db.add(
                Notification(
                    user_id=user_id,
                    type=NotificationType.PRICE_CHANGE.value,
                    title=title,
                    body=body,
                    category=messages.NOTIFICATION_CATEGORY,
                    link="/subscriptions",
                    action_url=cancel_url,
                    action_label=messages.ACTION_CANCEL_GUIDE if cancel_url else None,
                    dedup_key=key,
                )
            )

        await self.db.commit()

    async def sync_all_derived(self, user_id: UUID) -> None:
        """분석 결과를 인박스 알림으로 일괄 승격 (인박스 조회·발송 공통 진입점)."""
        await self.sync_overlap_notifications(user_id)
        await self.sync_price_change_notifications(user_id)
        await self.sync_trial_notifications(user_id)
        await self.sync_renewal_notifications(user_id)
        await self.sync_budget_notifications(user_id)
        await self.sync_exchange_rate_notifications(user_id)

    async def _cancel_urls(self, user_id: UUID) -> dict[str, str]:
        """구독ID → 서비스 해지 URL (cancel_url 있는 것만)."""
        from app.models.service import Service

        rows = (
            await self.db.execute(
                select(Subscription.id, Service.cancel_url)
                .join(Service, Subscription.service_id == Service.id)
                .where(
                    Subscription.user_id == user_id,
                    Service.cancel_url.isnot(None),
                )
            )
        ).all()
        return {str(sid): url for sid, url in rows if url}

    async def _existing_keys(self, user_id: UUID, ntype: NotificationType) -> set[str]:
        rows = (
            await self.db.execute(
                select(Notification.dedup_key).where(
                    Notification.user_id == user_id,
                    Notification.type == ntype.value,
                )
            )
        ).scalars().all()
        return set(rows)

    async def sync_trial_notifications(self, user_id: UUID) -> None:
        """무료 체험 만료 임박(D-7 이내) 알림."""
        from app.services.analytics_service import AnalyticsService

        trials = (await AnalyticsService(self.db).get_trial_subscriptions(user_id)).trials
        existing = await self._existing_keys(user_id, NotificationType.TRIAL_EXPIRY)
        cancel_urls = await self._cancel_urls(user_id)

        for t in trials:
            if t.days_remaining < 0 or t.days_remaining > 7:
                continue
            key = f"trial:{t.id}:{t.trial_end_date}"
            if key in existing:
                continue
            dday = "오늘" if t.days_remaining == 0 else f"D-{t.days_remaining}"
            cancel_url = cancel_urls.get(t.id)
            self.db.add(
                Notification(
                    user_id=user_id,
                    type=NotificationType.TRIAL_EXPIRY.value,
                    title=messages.trial_title(t.service_name, dday),
                    body=messages.trial_body(t.trial_end_date, int(t.cost_after_trial_krw)),
                    category=messages.NOTIFICATION_CATEGORY,
                    link="/subscriptions",
                    action_url=cancel_url,
                    action_label=messages.ACTION_CANCEL_GUIDE if cancel_url else None,
                    dedup_key=key,
                )
            )
        await self.db.commit()

    async def sync_renewal_notifications(self, user_id: UUID) -> None:
        """결제일이 다가온 구독 알림.

        "결제 N일 전 알림" 설정이 이 함수의 범위다. 지금까지 그 설정은 대시보드
        목록의 조회 범위로만 쓰이고 알림은 나가지 않았다.

        dedup_key에 결제일을 넣어 결제 주기마다 한 번씩만 나가게 한다. 갱신되면
        next_billing_date가 앞으로 밀리므로 다음 주기에 자연히 새 알림이 생긴다.
        """
        # get_settings()는 설정이 없으면 404를 던진다. 이 함수는 스케줄러에서도
        # 도는데 배경 작업이 HTTP 예외로 죽으면 뒤 사용자들 알림까지 밀린다.
        ns = (
            await self.db.execute(
                select(NotificationSetting).where(NotificationSetting.user_id == user_id)
            )
        ).scalar_one_or_none()
        days_before = ns.notify_days_before if ns else DEFAULT_NOTIFY_DAYS_BEFORE

        today = date.today()
        end_date = today + timedelta(days=days_before)

        upcoming = (
            await self.db.execute(
                select(Subscription).where(
                    Subscription.user_id == user_id,
                    Subscription.status == SubscriptionStatus.ACTIVE,
                    Subscription.next_billing_date >= today,
                    Subscription.next_billing_date <= end_date,
                )
            )
        ).scalars().all()
        if not upcoming:
            return

        existing = await self._existing_keys(user_id, NotificationType.RENEWAL)
        cancel_urls = await self._cancel_urls(user_id)

        for sub in upcoming:
            key = f"renewal:{sub.id}:{sub.next_billing_date}"
            if key in existing:
                continue

            days = (sub.next_billing_date - today).days
            when = messages.renewal_when(days)
            # 청구되는 건 분담 몫이 아니라 전체 금액이므로 cost를 그대로 쓴다
            amount = _fmt_money(sub.cost, sub.currency)
            share = ""
            if (sub.member_count or 1) > 1:
                share = messages.renewal_share(_fmt_money(sub.personal_cost, sub.currency))

            self.db.add(
                Notification(
                    user_id=user_id,
                    type=NotificationType.RENEWAL.value,
                    title=messages.renewal_title(sub.service_name, when),
                    body=messages.renewal_body(
                        sub.next_billing_date.month, sub.next_billing_date.day, amount, share
                    ),
                    category=messages.NOTIFICATION_CATEGORY,
                    link="/subscriptions",
                    action_url=cancel_urls.get(str(sub.id)),
                    action_label=messages.ACTION_CANCEL_GUIDE if cancel_urls.get(str(sub.id)) else None,
                    dedup_key=key,
                )
            )
        await self.db.commit()

    async def sync_budget_notifications(self, user_id: UUID) -> None:
        """월 예산 초과 알림 (월 1회). 사용자가 꺼 두었으면 만들지 않는다."""
        from app.services.analytics_service import AnalyticsService

        setting = (
            await self.db.execute(
                select(NotificationSetting).where(NotificationSetting.user_id == user_id)
            )
        ).scalar_one_or_none()
        if setting is not None and not setting.budget_alerts:
            return

        status_ = await AnalyticsService(self.db).get_budget_status(user_id)
        if not status_.is_over_budget or status_.budget_monthly is None:
            return

        key = f"budget:{date.today():%Y-%m}"
        existing = await self._existing_keys(user_id, NotificationType.BUDGET)
        if key in existing:
            return

        self.db.add(
            Notification(
                user_id=user_id,
                type=NotificationType.BUDGET.value,
                title=messages.BUDGET_TITLE,
                body=messages.budget_body(
                    int(status_.current_spending),
                    int(status_.budget_monthly),
                    status_.percentage_used,
                ),
                category=messages.NOTIFICATION_CATEGORY,
                link="/analytics",
                dedup_key=key,
            )
        )
        await self.db.commit()

    async def sync_exchange_rate_notifications(self, user_id: UUID) -> None:
        """외화 구독 환율 급등 알림 (구독별 월 1회)."""
        setting = (
            await self.db.execute(
                select(NotificationSetting).where(NotificationSetting.user_id == user_id)
            )
        ).scalar_one_or_none()
        if setting is not None and not setting.fx_alerts:
            return

        from app.services.analytics_service import AnalyticsService

        alerts = (await AnalyticsService(self.db).get_exchange_rate_alerts(user_id)).alerts
        if not alerts:
            return

        existing = await self._existing_keys(user_id, NotificationType.EXCHANGE_RATE)
        month = f"{date.today():%Y-%m}"

        for a in alerts:
            key = f"fx:{a.subscription_id}:{month}"
            if key in existing:
                continue
            self.db.add(
                Notification(
                    user_id=user_id,
                    type=NotificationType.EXCHANGE_RATE.value,
                    title=messages.fx_title(a.service_name),
                    body=messages.fx_body(a.currency, a.change_percentage, int(a.extra_cost_krw)),
                    category=messages.NOTIFICATION_CATEGORY,
                    link="/analytics",
                    dedup_key=key,
                )
            )
        await self.db.commit()

    # ── 설정 ───────────────────────────────────────────────

    async def get_settings(self, user_id: UUID) -> NotificationSetting:
        result = await self.db.execute(
            select(NotificationSetting).where(NotificationSetting.user_id == user_id)
        )
        settings = result.scalar_one_or_none()
        if not settings:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification settings not found")
        return settings

    async def set_push_token(self, user_id: UUID, token: str | None) -> NotificationSetting:
        """Expo 푸시 토큰 저장 (설정이 없으면 생성)."""
        result = await self.db.execute(
            select(NotificationSetting).where(NotificationSetting.user_id == user_id)
        )
        settings_row = result.scalar_one_or_none()
        if settings_row is None:
            settings_row = NotificationSetting(user_id=user_id)
            self.db.add(settings_row)
        # 처음 토큰을 받는 기기라면 푸시를 켜 준다. 사용자가 OS 알림 권한을
        # 허용해서 여기까지 온 것이라 켜는 쪽이 기대에 맞다.
        #
        # 다만 이미 토큰이 있던 계정은 건드리지 않는다. 앱은 실행할 때마다
        # 토큰을 다시 등록하는데, 그때마다 켜 버리면 웹에서 꺼 둔 설정이
        # 앱을 한 번 열었다는 이유로 되살아난다.
        first_token = settings_row.push_token is None
        settings_row.push_token = token
        if token and first_token:
            settings_row.push_notifications = True
        await self.db.commit()
        await self.db.refresh(settings_row)
        return settings_row

    async def update_settings(self, user_id: UUID, data: NotificationSettingsUpdateRequest) -> NotificationSetting:
        settings = await self.get_settings(user_id)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(settings, key, value)
        await self.db.commit()
        await self.db.refresh(settings)
        return settings

    async def get_upcoming_renewals(self, user_id: UUID) -> list[Subscription]:
        settings = await self.get_settings(user_id)
        today = date.today()
        end_date = today + timedelta(days=settings.notify_days_before)

        result = await self.db.execute(
            select(Subscription)
            .options(selectinload(Subscription.category))
            .where(
                Subscription.user_id == user_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.next_billing_date >= today,
                Subscription.next_billing_date <= end_date,
            )
            .order_by(Subscription.next_billing_date.asc())
        )
        return await annotate_monthly_krw(list(result.scalars().all()))
