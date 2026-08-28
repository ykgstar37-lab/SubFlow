from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.notification_setting import NotificationSetting
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User
from app.services.delivery_service import send_email, send_expo_push
from app.services.email_template import render_email


async def _top_news_headline(db: AsyncSession, user_id) -> str | None:
    from app.services.news_service import get_cached_news, personalize_news

    items = await get_cached_news(db, limit=12)
    names = [
        n
        for n in (
            await db.execute(
                select(Subscription.service_name).where(
                    Subscription.user_id == user_id,
                    Subscription.status == SubscriptionStatus.ACTIVE,
                )
            )
        )
        .scalars()
        .all()
        if n
    ]
    if names:
        items = personalize_news(items, names)
    return items[0]["title"] if items else None


async def _build_digest(db: AsyncSession, user_id) -> tuple[str, str, str, str] | None:
    """(push_title, push_body, email_body, email_html) 반환. 보낼 내용이 없으면 None."""
    from app.services.analytics_service import AnalyticsService
    from app.services.notification_service import NotificationService

    svc = NotificationService(db)
    await svc.sync_all_derived(user_id)
    unread = await svc.get_unread_count(user_id)

    savings = await AnalyticsService(db).get_savings_suggestions(user_id)
    total_savings = int(savings.total_potential_savings_krw or 0)
    top_saving = savings.suggestions[0] if savings.suggestions else None

    headline = await _top_news_headline(db, user_id)

    # 보낼 만한 내용이 하나도 없으면 스킵 (빈 다이제스트 방지)
    if unread == 0 and total_savings == 0 and headline is None:
        return None

    push_parts = []
    if unread:
        push_parts.append(f"안읽은 알림 {unread}건")
    if total_savings:
        push_parts.append(f"절약 가능 최대 {total_savings:,}원")
    push_body = " · ".join(push_parts) or "이번 주 구독 현황을 확인해보세요"

    lines = ["이번 주 SubFlow Brief", ""]
    if unread:
        lines.append(f"• 확인하지 않은 알림이 {unread}건 있어요.")
    if top_saving:
        lines.append(f"• {top_saving.suggestion_text}")
    if headline:
        lines.append(f"• 관심 소식: {headline}")
    lines += ["", "앱에서 자세히 확인하세요 — SubFlow"]
    email_body = "\n".join(lines)

    return "이번 주 SubFlow Brief 📬", push_body, email_body


async def send_weekly_digest(db: AsyncSession) -> int:
    """주간 다이제스트를 발송 채널이 켜진 사용자에게 발송. 발송한 사용자 수 반환."""
    channels = (
        await db.execute(
            select(NotificationSetting).where(
                or_(
                    NotificationSetting.push_notifications.is_(True),
                    NotificationSetting.email_notifications.is_(True),
                )
            )
        )
    ).scalars().all()

    sent = 0
    for ns in channels:
        digest = await _build_digest(db, ns.user_id)
        if digest is None:
            continue
        title, push_body, email_body, email_html = digest
        delivered = False

        if ns.push_notifications and ns.push_token:
            if await send_expo_push(ns.push_token, title, push_body):
                delivered = True

        if ns.email_notifications and settings.SMTP_HOST:
            user = await db.get(User, ns.user_id)
            if user and user.email:
                if await send_email(
                    user.email, f"[SubFlow] {title}", email_body, html=email_html
                ):
                    delivered = True

        if delivered:
            sent += 1

    return sent
