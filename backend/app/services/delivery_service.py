import logging
from datetime import datetime, timezone
from email.message import EmailMessage

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import messages
from app.config import settings
from app.models.notification import Notification
from app.models.notification_setting import NotificationSetting
from app.models.user import User
from app.services.email_template import render_email

logger = logging.getLogger("uvicorn.error")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_expo_push(token: str, title: str, body: str) -> bool:
    """Expo Push API로 발송. 성공적으로 접수(HTTP 200)되면 True.
    Expo 푸시는 별도 자격증명 없이 기기 토큰만으로 발송 가능하다.
    """
    if not token:
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                EXPO_PUSH_URL,
                # priority/channelId를 줘야 안드로이드에서 배너로 바로 뜬다.
                # 없으면 기본 채널·기본 우선순위로 떨어져 알림함에만 쌓인다.
                json={
                    "to": token,
                    "title": title,
                    "body": body,
                    "sound": "default",
                    "priority": "high",
                    "channelId": "default",
                },
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
            resp.raise_for_status()
        return True
    except Exception as exc:
        logger.warning("[delivery] expo push failed: %s", exc)
        return False


RESEND_API_URL = "https://api.resend.com/emails"


def _resend_key() -> str:
    """Resend를 SMTP로 설정해 뒀으면 그 비밀번호가 곧 API 키다(re_로 시작).
    별도 환경변수를 새로 받지 않고 있는 값을 그대로 쓴다."""
    if "resend.com" in settings.SMTP_HOST and settings.SMTP_PASSWORD.startswith("re_"):
        return settings.SMTP_PASSWORD
    return ""


async def _send_via_resend(
    to: str,
    subject: str,
    body: str,
    key: str,
    attachments: list[dict] | None = None,
    reply_to: str | None = None,
    html: str | None = None,
) -> bool:
    """Resend HTTP API로 발송.

    PaaS(Railway 등)는 스팸 방지로 아웃바운드 25/587 포트를 막는 경우가 많다.
    실제로 여기서 SMTP가 60초 타임아웃을 다 채워 회원가입 응답을 붙잡았다.
    HTTPS는 열려 있으므로 같은 키로 REST를 쓴다.
    """
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            RESEND_API_URL,
            headers={"Authorization": "Bearer " + key},
            json={
                "from": settings.SMTP_FROM,
                "to": [to],
                "subject": subject,
                # 평문을 항상 함께 싣는다. HTML을 끄고 보는 사람도 있고,
                # 스팸 필터도 평문이 없는 메일에 점수를 깎는다.
                "text": body,
                **({"html": html} if html else {}),
                # [{"filename": ..., "content": <base64 문자열>}]
                **({"attachments": attachments} if attachments else {}),
                # 보낸 주소는 no-reply라 그냥 회신하면 아무 데도 안 간다.
                # 신고자 주소를 넣어 두면 받은 메일에서 바로 답장이 된다.
                **({"reply_to": reply_to} if reply_to else {}),
            },
        )
    if r.status_code >= 400:
        logger.warning("[delivery] resend %s: %s", r.status_code, r.text[:200])
        return False
    return True


async def send_email(
    to: str,
    subject: str,
    body: str,
    attachments: list[dict] | None = None,
    reply_to: str | None = None,
    html: str | None = None,
) -> bool:
    """이메일 발송. 미설정이면 False(no-op).

    attachments와 reply_to는 Resend 경로에서만 실린다. SMTP 폴백은 MIME 조립이 따로
    필요한데, 운영은 Resend를 쓰고 SMTP는 다른 공급자용 예비 경로라
    첨부 없이 본문만 보낸다(첨부 때문에 신고 자체를 놓치는 편이 더 나쁘다).
    """
    if not to:
        return False
    key = _resend_key()
    if key:
        try:
            return await _send_via_resend(to, subject, body, key, attachments, reply_to, html)
        except Exception as exc:
            logger.warning("[delivery] resend failed: %s", exc)
            return False
    if not settings.SMTP_HOST:
        return False
    try:
        import aiosmtplib

        # 변수명이 문구 모듈(messages)과 헷갈리지 않게 mail로 둔다
        mail = EmailMessage()
        mail["From"] = settings.SMTP_FROM
        mail["To"] = to
        mail["Subject"] = subject
        mail.set_content(body)
        if html:
            # multipart/alternative — HTML을 못 그리는 클라이언트는 평문으로 떨어진다
            mail.add_alternative(html, subtype="html")

        await aiosmtplib.send(
            mail,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER or None,
            password=settings.SMTP_PASSWORD or None,
            start_tls=settings.SMTP_TLS,
            timeout=10,
        )
        return True
    except Exception as exc:
        logger.warning("[delivery] email failed: %s", exc)
        return False


def _build_message(pending: list[Notification]) -> tuple[str, str]:
    if len(pending) == 1:
        return pending[0].title, (pending[0].body or "")
    title = messages.push_multi_title(len(pending))
    body = messages.push_multi_body(pending[0].title, len(pending))
    return title, body


def _email_body(pending: list[Notification]) -> str:
    lines = [messages.MAIL_TEXT_HEADER, ""]
    for n in pending:
        lines.append(f"• {n.title}")
        if n.body:
            lines.append(f"  {n.body}")
    lines += ["", messages.MAIL_TEXT_FOOTER]
    return "\n".join(lines)


def _email_html(pending: list[Notification]) -> str:
    """같은 내용을 HTML로. 평문(_email_body)과 함께 실어 보낸다."""
    # 한 건이면 제목을 머리글로 올리고 본문만 남긴다. 둘 다 찍으면 같은 문장이
    # 위아래로 두 번 나온다.
    if len(pending) == 1:
        n = pending[0]
        heading = n.title
        items: list[tuple[str, str | None]] = [(n.body, None)] if n.body else []
    else:
        heading = messages.mail_multi_heading(len(pending))
        items = [(n.title, n.body) for n in pending]

    return render_email(
        heading=heading,
        items=items,
        cta_label=messages.MAIL_CTA,
        cta_url=settings.APP_BASE_URL,
        footer=messages.MAIL_FOOTER_NOTIFICATION,
    )


async def deliver_pending(db: AsyncSession) -> int:
    """미읽음·미배송 알림을 사용자 설정에 따라 푸시/이메일로 발송하고 delivered_at 마킹.
    발송 채널이 하나도 없으면(토큰/ SMTP 미설정) 마킹하지 않아 나중에 재시도된다.
    반환값은 발송 처리된 알림 수.
    """
    # 순환 import 방지
    from app.services.notification_service import NotificationService

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

    delivered_count = 0
    svc = NotificationService(db)

    for ns in channels:
        # 최신 파생 알림 생성 (중복/가격/체험/예산/환율)
        await svc.sync_all_derived(ns.user_id)

        pending = (
            await db.execute(
                select(Notification)
                .where(
                    Notification.user_id == ns.user_id,
                    Notification.is_read.is_(False),
                    Notification.is_archived.is_(False),
                    Notification.delivered_at.is_(None),
                )
                .order_by(Notification.created_at.desc())
            )
        ).scalars().all()
        if not pending:
            continue

        title, body = _build_message(pending)
        attempted = False

        if ns.push_notifications and ns.push_token:
            if await send_expo_push(ns.push_token, title, body):
                attempted = True

        if ns.email_notifications and settings.SMTP_HOST:
            user = await db.get(User, ns.user_id)
            # 확인되지 않은 주소로는 보내지 않는다. 오타로 가입한 경우 남의 메일함에
            # 구독 내역이 들어가고, 반송이 쌓이면 발신 도메인 평판도 깎인다.
            if user and user.email and user.email_verified:
                if await send_email(
                    user.email,
                    messages.subject(title),
                    _email_body(pending),
                    html=_email_html(pending),
                ):
                    attempted = True

        # 실제로 시도한 채널이 있을 때만 배송 완료로 표시 (없으면 다음 실행에서 재시도)
        if attempted:
            now = datetime.now(timezone.utc)
            for n in pending:
                n.delivered_at = now
            delivered_count += len(pending)

    await db.commit()
    return delivered_count
