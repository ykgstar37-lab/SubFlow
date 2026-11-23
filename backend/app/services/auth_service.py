import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select, update
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
from app.models.email_code import EmailCode
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

CODE_EXPIRE_MINUTES = 10
CODE_MAX_ATTEMPTS = 5
DEVICE_USERNAME = "SubFlow 사용자"


def issue_tokens(user: User) -> TokenResponse:
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id), "tv": user.token_version})
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


def _code_hash(email: str, code: str) -> str:
    # 주소를 섞어 두면 같은 코드라도 다른 주소의 행과 맞지 않는다
    return hashlib.sha256(f"{settings.SECRET_KEY}:code:{email}:{code}".encode()).hexdigest()


def normalize_email(email: str) -> str:
    return email.strip().lower()


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
    async def delete_account(self, user: User, password: str | None, confirm: bool = False) -> None:
        """계정과 딸린 데이터를 전부 지운다 (되돌릴 수 없음).

        Apple 심사 지침 5.1.1(v) — 가입이 가능한 앱은 앱 안에서 계정을
        삭제할 수 있어야 한다.

        자식 테이블을 명시적으로 지운다. users.id를 참조하는 FK 중
        ON DELETE CASCADE가 걸린 것은 notifications뿐이라, ORM 캐스케이드에
        기대면 payment_history·subscription_history에서 FK 위반이 난다.
        """
        # 구버전 앱은 비밀번호를 보낸다. 새 앱은 로그인이 없어 비밀번호가 없으니
        # 화면에서 한 번 더 확인받았다는 confirm으로 대신한다.
        if password is not None and user.hashed_password:
            if not verify_password(password, user.hashed_password):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="비밀번호가 올바르지 않습니다.",
                )
        elif not confirm:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="계정 삭제를 한 번 더 확인해주세요.",
            )

        # 참조하는 쪽부터 — 구독을 먼저 지우면 결제/변경 이력이 FK로 막힌다.
        # ORM의 db.delete(user) 대신 전부 SQL DELETE로 처리한다: 전자는 flush 중에
        # user.subscriptions를 lazy load 하려 들어 async에서 MissingGreenlet이 난다.
        if user.email:
            await self.db.execute(delete(EmailCode).where(EmailCode.email == user.email.lower()))
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

        return issue_tokens(user)

    async def refresh_token(self, refresh_token: str) -> TokenResponse:
        payload = decode_token(refresh_token)
        if payload is None or payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        user_id = payload.get("sub")
        result = await self.db.execute(select(User).where(User.id == UUID(user_id)))
        user = result.scalar_one_or_none()

        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

        # token_version을 올리면 그때까지 나간 토큰은 더 못 들어온다.
        # 예전에 나간 토큰에는 tv 대신 비밀번호 지문(pwf)이 들어 있다. 업데이트 전부터
        # 로그인해 있던 사람이 그대로 이어 쓰도록 그것도 받아 준다.
        if "tv" in payload:
            valid = payload["tv"] == user.token_version
        else:
            valid = bool(user.hashed_password) and payload.get("pwf") == password_fingerprint(
                user.hashed_password
            )
        if not valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            )

        return issue_tokens(user)

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
        # 비밀번호를 바꾸면 다른 기기의 로그인을 끊는다 (기기를 잃어버렸을 때의 수단)
        user.token_version += 1
        await self.db.commit()

    # ── 로그인 없는 시작: 기기 계정 ────────────────────────────────────
    async def create_device_user(self) -> TokenResponse:
        """앱을 처음 열면 이메일·비밀번호 없는 계정을 만든다.

        기기에 남는 리프레시 토큰이 곧 이 계정의 열쇠다. 이메일을 붙이기 전에
        앱을 지우거나 폰을 잃어버리면 되찾을 방법이 없다. 그래서 앱이 이메일 연결을 권한다.
        """
        user = User(username=DEVICE_USERNAME, email=None, hashed_password=None, email_verified=False)
        self.db.add(user)
        await self.db.flush()
        self.db.add(NotificationSetting(user_id=user.id))
        await self.db.commit()
        await self.db.refresh(user)
        return issue_tokens(user)

    async def _find_by_email(self, email: str) -> User | None:
        result = await self.db.execute(select(User).where(func.lower(User.email) == email))
        return result.scalar_one_or_none()

    # ── 6자리 코드 ──────────────────────────────────────────────────
    async def send_code(self, raw_email: str) -> None:
        """코드를 만들어 보낸다. 가입 여부와 상관없이 같은 응답을 준다 (사용자 열거 방지)."""
        email = normalize_email(raw_email)
        code = f"{secrets.randbelow(1_000_000):06d}"
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=CODE_EXPIRE_MINUTES)

        # 새 코드를 보내면 예전 코드는 못 쓴다
        await self.db.execute(delete(EmailCode).where(EmailCode.email == email))
        self.db.add(EmailCode(email=email, code_hash=_code_hash(email, code), expires_at=expires_at))
        await self.db.commit()

        html = render_email(
            heading=messages.CODE_HEADING,
            items=[(code, messages.code_item_body(expires_at))],
            footer=messages.code_footer(now),
        )
        sent = await send_email(
            email, messages.code_subject(code), messages.code_text(code, expires_at, now), html=html
        )
        if not sent:
            logger.warning("[auth] SMTP 미설정 - %s 확인 코드: %s", email, code)

    async def _consume_code(self, email: str, code: str) -> None:
        invalid = HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="코드가 맞지 않거나 만료되었습니다. 코드를 다시 받아주세요.",
        )
        result = await self.db.execute(
            select(EmailCode).where(EmailCode.email == email).order_by(EmailCode.created_at.desc())
        )
        row = result.scalars().first()
        if row is None or row.expires_at < datetime.now(timezone.utc):
            raise invalid
        if row.attempts >= CODE_MAX_ATTEMPTS:
            # 여러 번 틀리면 이 코드는 버린다. 백만 가지를 하나씩 넣어 보는 걸 막는다
            raise invalid
        if not hmac.compare_digest(row.code_hash, _code_hash(email, code.strip())):
            row.attempts += 1
            await self.db.commit()
            raise invalid
        await self.db.execute(delete(EmailCode).where(EmailCode.email == email))

    # ── 앱: 지금 계정에 이메일 붙이기 ──────────────────────────────────
    async def link_email(self, current: User, raw_email: str, code: str) -> tuple[User, bool]:
        """코드가 맞으면 지금 계정에 이메일을 붙인다. (붙은 계정, 합쳐졌는지)

        그 이메일을 이미 다른 계정이 쓰고 있으면(예전 가입자, 또는 웹에서 먼저 만든 계정)
        지금 기기 계정의 데이터를 그쪽으로 옮기고 그 계정으로 갈아탄다.
        예전 가입자가 업데이트 후 이메일 코드만 넣으면 원래 데이터가 그대로 돌아오는 길이다.
        """
        email = normalize_email(raw_email)
        await self._consume_code(email, code)

        owner = await self._find_by_email(email)
        if owner is None or owner.id == current.id:
            if owner is None:
                current.email = email
            current.email_verified = True
            await self.db.commit()
            await self.db.refresh(current)
            return current, False

        if current.email:
            # 이미 이메일이 있는 계정끼리 합치는 건 하지 않는다. 누구 데이터가 남을지 모호하다
            await self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이 이메일은 이미 다른 계정에서 쓰고 있습니다.",
            )

        await self._merge_into(current, owner)
        owner.email_verified = True
        await self.db.commit()
        await self.db.refresh(owner)
        return owner, True

    async def _merge_into(self, src: User, dst: User) -> None:
        """src(기기 계정)의 데이터를 dst로 옮기고 src를 지운다. 커밋은 부르는 쪽이 한다."""
        # 직접 만든 카테고리·서비스는 사람별로 이름이 유일하다. dst에 같은 이름이 있으면
        # 그쪽 것을 쓰고, 없으면 통째로 옮긴다.
        src_cats = (await self.db.execute(select(Category).where(Category.user_id == src.id))).scalars().all()
        for cat in src_cats:
            same = (await self.db.execute(
                select(Category).where(Category.user_id == dst.id, Category.name == cat.name)
            )).scalar_one_or_none()
            if same:
                await self.db.execute(
                    update(Subscription).where(Subscription.category_id == cat.id).values(category_id=same.id)
                )
                await self.db.execute(
                    update(Service).where(Service.category_id == cat.id).values(category_id=same.id)
                )
                await self.db.execute(delete(Category).where(Category.id == cat.id))
            else:
                cat.user_id = dst.id
        await self.db.flush()

        src_svcs = (await self.db.execute(select(Service).where(Service.user_id == src.id))).scalars().all()
        for svc in src_svcs:
            same = (await self.db.execute(
                select(Service).where(Service.user_id == dst.id, Service.name == svc.name)
            )).scalar_one_or_none()
            if same:
                await self.db.execute(
                    update(Subscription).where(Subscription.service_id == svc.id).values(service_id=same.id)
                )
                await self.db.execute(
                    update(ServicePlan).where(ServicePlan.service_id == svc.id).values(service_id=same.id)
                )
                await self.db.execute(delete(Service).where(Service.id == svc.id))
            else:
                svc.user_id = dst.id
        await self.db.flush()

        for model in (Subscription, SubscriptionHistory, PaymentHistory, ServicePlan):
            await self.db.execute(update(model).where(model.user_id == src.id).values(user_id=dst.id))
        # 알림함은 다시 만들어지는 것이라 옮기지 않는다 (dedup 키가 겹칠 수 있다)
        await self.db.execute(delete(Notification).where(Notification.user_id == src.id))

        # 이 기기의 푸시 토큰은 이제 dst 계정으로 받아야 한다
        src_setting = (await self.db.execute(
            select(NotificationSetting).where(NotificationSetting.user_id == src.id)
        )).scalar_one_or_none()
        dst_setting = (await self.db.execute(
            select(NotificationSetting).where(NotificationSetting.user_id == dst.id)
        )).scalar_one_or_none()
        push_token = src_setting.push_token if src_setting else None
        await self.db.execute(delete(NotificationSetting).where(NotificationSetting.user_id == src.id))
        await self.db.flush()
        if push_token:
            if dst_setting is None:
                dst_setting = NotificationSetting(user_id=dst.id)
                self.db.add(dst_setting)
            dst_setting.push_token = push_token
        await self.db.execute(delete(User).where(User.id == src.id))
        await self.db.flush()

    # ── 웹: 이메일 코드로 들어가기 ─────────────────────────────────────
    async def login_with_code(self, raw_email: str, code: str) -> TokenResponse:
        """웹은 비밀번호 없이 이메일 코드로 들어간다. 처음 보는 주소면 계정을 새로 만든다."""
        email = normalize_email(raw_email)
        await self._consume_code(email, code)

        user = await self._find_by_email(email)
        if user is None:
            user = User(
                email=email,
                username=email.split("@")[0][:100] or DEVICE_USERNAME,
                hashed_password=None,
                email_verified=True,
            )
            self.db.add(user)
            await self.db.flush()
            self.db.add(NotificationSetting(user_id=user.id))
        else:
            if not user.is_active:
                await self.db.commit()
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
            # 메일함을 열어 코드를 넣었으니 주소 확인도 끝난 셈이다
            user.email_verified = True
        await self.db.commit()
        await self.db.refresh(user)
        return issue_tokens(user)
