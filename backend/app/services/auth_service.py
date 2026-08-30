import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import messages
from app.config import settings
from app.core.security import (
    EMAIL_VERIFY_EXPIRE_HOURS,
    PASSWORD_RESET_EXPIRE_MINUTES,
    create_access_token,
    create_email_verify_token,
    create_password_reset_token,
    create_refresh_token,
    password_fingerprint,
    decode_email_verify_token,
    decode_password_reset_token,
    decode_token,
    hash_password,
    peek_token_subject,
    verify_password,
)
from app.models.category import Category
from app.models.notification import Notification
from app.models.notification_setting import NotificationSetting
from app.models.payment_history import PaymentHistory
from app.models.plan_price_history import PlanPriceHistory
from app.models.service import Service
from app.models.service_plan import ServicePlan
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.services.delivery_service import send_email
from app.services.email_template import render_email

logger = logging.getLogger("uvicorn.error")

# 존재하지 않는 이메일에도 동일한 시간을 소요시켜 타이밍 기반 사용자 열거를 막는다
_DUMMY_HASH = hash_password("timing_attack_mitigation_dummy")


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register(self, data: RegisterRequest) -> User:
        result = await self.db.execute(select(User).where(User.email == data.email))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        user = User(
            email=data.email,
            hashed_password=hash_password(data.password),
            username=data.username,
        )
        self.db.add(user)
        await self.db.flush()

        notification_setting = NotificationSetting(user_id=user.id)
        self.db.add(notification_setting)
        await self.db.commit()
        await self.db.refresh(user)

        # 인증 메일은 가입을 막지 않는다 — 실패해도 계정은 이미 만들어졌다.
        await self.send_verification_email(user)
        return user

    # ── 계정 삭제 ────────────────────────────────────────────────────
    async def delete_account(self, user: User, password: str) -> None:
        """계정과 딸린 데이터를 전부 지운다 (되돌릴 수 없음).

        Apple 심사 지침 5.1.1(v) — 가입이 가능한 앱은 앱 안에서 계정을
        삭제할 수 있어야 한다.

        자식 테이블을 명시적으로 지운다. users.id를 참조하는 FK 중
        ON DELETE CASCADE가 걸린 것은 notifications뿐이라, ORM 캐스케이드에
        기대면 payment_history·subscription_history에서 FK 위반이 난다.
        """
        if not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="비밀번호가 올바르지 않습니다.",
            )

        # 참조하는 쪽부터 — 구독을 먼저 지우면 결제/변경 이력이 FK로 막힌다.
        # ORM의 db.delete(user) 대신 전부 SQL DELETE로 처리한다: 전자는 flush 중에
        # user.subscriptions를 lazy load 하려 들어 async에서 MissingGreenlet이 난다.
        for model in (PaymentHistory, SubscriptionHistory, Notification,
                      NotificationSetting, Subscription):
            await self.db.execute(delete(model).where(model.user_id == user.id))

        # 직접 등록한 서비스·카테고리도 users.id를 참조한다. 남겨 두면 계정 삭제가
        # FK로 막힌다. 요금제와 가격 이력이 서비스를 참조하므로 그쪽부터 지운다.
        my_service_ids = select(Service.id).where(Service.user_id == user.id).scalar_subquery()
        my_plan_ids = select(ServicePlan.id).where(
            ServicePlan.service_id.in_(my_service_ids)
        ).scalar_subquery()
        await self.db.execute(delete(PlanPriceHistory).where(PlanPriceHistory.plan_id.in_(my_plan_ids)))
        await self.db.execute(delete(ServicePlan).where(ServicePlan.service_id.in_(my_service_ids)))
        # 기본 카탈로그 서비스에 직접 넣어 둔 요금제도 users.id를 참조한다.
        # 서비스로는 안 걸리므로 따로 지운다.
        my_custom_plan_ids = select(ServicePlan.id).where(
            ServicePlan.user_id == user.id
        ).scalar_subquery()
        await self.db.execute(
            delete(PlanPriceHistory).where(PlanPriceHistory.plan_id.in_(my_custom_plan_ids))
        )
        await self.db.execute(delete(ServicePlan).where(ServicePlan.user_id == user.id))
        await self.db.execute(delete(Service).where(Service.user_id == user.id))
        await self.db.execute(delete(Category).where(Category.user_id == user.id))

        await self.db.execute(delete(User).where(User.id == user.id))
        await self.db.commit()

    # ── 이메일 인증 ──────────────────────────────────────────────────
    async def send_verification_email(self, user: User) -> None:
        if user.email_verified:
            return
        token = create_email_verify_token(str(user.id), user.email)
        link = f"{settings.APP_BASE_URL.rstrip('/')}/verify-email?token={token}"
        # 토큰 만료와 같은 시각을 본문에도 적는다. 메일마다 값이 달라지므로
        # Gmail이 같은 대화의 앞 메일과 겹친다고 보고 접어 버리지 않는다.
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=EMAIL_VERIFY_EXPIRE_HOURS)
        body = messages.verify_text(user.username, link, expires_at, now)
        html = render_email(
            heading=messages.verify_heading(user.username),
            items=[(
                messages.VERIFY_ITEM_TITLE,
                messages.verify_item_body(expires_at),
            )],
            cta_label=messages.VERIFY_CTA,
            cta_url=link,
            footer=messages.verify_footer(now),
        )
        sent = await send_email(
            user.email, messages.subject(messages.VERIFY_SUBJECT), body, html=html
        )
        if not sent:
            logger.warning("[auth] SMTP 미설정 - 인증 링크: %s", link)

    async def verify_email(self, token: str) -> None:
        invalid = HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="링크가 만료되었거나 유효하지 않습니다. 인증 메일을 다시 보내주세요.",
        )
        user_id = peek_token_subject(token)
        if not user_id:
            raise invalid
        try:
            uid = UUID(user_id)
        except ValueError:
            raise invalid

        result = await self.db.execute(select(User).where(User.id == uid))
        user = result.scalar_one_or_none()
        if not user:
            raise invalid
        # 이미 인증된 계정에 같은 링크를 다시 열면 조용히 성공 처리한다
        # (메일 클라이언트가 링크를 미리 여는 경우가 있다)
        if user.email_verified:
            return
        if decode_email_verify_token(token, user.email) is None:
            raise invalid

        user.email_verified = True
        await self.db.commit()

    async def login(self, data: LoginRequest) -> TokenResponse:
        result = await self.db.execute(select(User).where(User.email == data.email))
        user = result.scalar_one_or_none()

        # 이메일 없음/비번 오류를 동일한 401·메시지로 통일 (사용자 열거 방지)
        invalid = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )
        if not user:
            verify_password(data.password, _DUMMY_HASH)  # 응답 시간 균일화
            raise invalid
        if not verify_password(data.password, user.hashed_password):
            raise invalid

        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

        access_token = create_access_token(data={"sub": str(user.id)})
        refresh_token = create_refresh_token(
            data={"sub": str(user.id), "pwf": password_fingerprint(user.hashed_password)}
        )

        return TokenResponse(access_token=access_token, refresh_token=refresh_token)

    async def refresh_token(self, refresh_token: str) -> TokenResponse:
        payload = decode_token(refresh_token)
        if payload is None or payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        user_id = payload.get("sub")
        result = await self.db.execute(select(User).where(User.id == UUID(user_id)))
        user = result.scalar_one_or_none()

        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

        # 비밀번호가 바뀌었으면 예전 토큰으로는 더 못 들어온다. 기기를 잃어버렸을 때
        # 비밀번호만 바꾸면 그 기기의 로그인이 끊긴다.
        if payload.get("pwf") != password_fingerprint(user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            )

        new_access_token = create_access_token(data={"sub": str(user.id)})
        new_refresh_token = create_refresh_token(
            data={"sub": str(user.id), "pwf": password_fingerprint(user.hashed_password)}
        )

        return TokenResponse(access_token=new_access_token, refresh_token=new_refresh_token)

    # ── 비밀번호 재설정 ──────────────────────────────────────────────
    async def request_password_reset(self, email: str) -> None:
        """가입 여부와 무관하게 조용히 끝낸다.

        '없는 이메일입니다'를 알려주면 가입자 명단을 캐낼 수 있다(사용자 열거).
        라우터는 어느 경우든 같은 메시지·상태코드를 돌려준다.
        """
        result = await self.db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            return

        token = create_password_reset_token(str(user.id), user.hashed_password)
        link = f"{settings.APP_BASE_URL.rstrip('/')}/reset-password?token={token}"
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)
        body = messages.reset_text(user.username, link, expires_at, now)
        html = render_email(
            heading=messages.RESET_HEADING,
            items=[(
                messages.reset_item_title(user.username),
                messages.reset_item_body(expires_at),
            )],
            cta_label=messages.RESET_CTA,
            cta_url=link,
            footer=messages.reset_footer(now),
        )
        sent = await send_email(
            user.email, messages.subject(messages.RESET_SUBJECT), body, html=html
        )
        if not sent:
            # SMTP 미설정(개발 환경)에서는 링크를 로그로 남겨 흐름을 확인할 수 있게 한다.
            logger.warning("[auth] SMTP 미설정 - 재설정 링크: %s", link)

    async def reset_password(self, token: str, new_password: str) -> None:
        invalid = HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="링크가 만료되었거나 이미 사용되었습니다. 다시 요청해주세요.",
        )

        # 서명 검증에 사용자의 현재 비밀번호 해시가 필요하므로 sub를 먼저 들여다본다.
        # (이 값 자체는 신뢰하지 않는다 — 아래 decode에서 서명이 실제로 검증된다)
        user_id = peek_token_subject(token)
        if not user_id:
            raise invalid
        try:
            uid = UUID(user_id)
        except ValueError:
            raise invalid

        result = await self.db.execute(select(User).where(User.id == uid))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise invalid
        if decode_password_reset_token(token, user.hashed_password) is None:
            raise invalid

        user.hashed_password = hash_password(new_password)
        await self.db.commit()
