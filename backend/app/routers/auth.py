from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.core.limiter import limiter
from app.models.user import User
from app.schemas.auth import (
    DeleteAccountRequest,
    EmailCodeRequest,
    EmailCodeVerifyRequest,
    ForgotPasswordRequest,
    LinkEmailResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SimpleMessage,
    TokenResponse,
    VerifyEmailRequest,
)
from app.schemas.user import UserResponse, UserUpdateRequest
from app.services.auth_service import AuthService, issue_tokens

router = APIRouter()


# ── 로그인 없는 앱 + 이메일 코드 ────────────────────────────────────────
# 앱은 처음 열 때 /device로 계정을 받는다. 이메일은 원할 때 /email/code → /email/link로 붙이고,
# 웹은 /email/code → /email/login으로 들어간다. 아래의 /register·/login(비밀번호)은
# 아직 스토어에 남은 구버전 앱 때문에 남겨 둔다.


@router.post("/device", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_device_account(request: Request, db: AsyncSession = Depends(get_db)):
    return await AuthService(db).create_device_user()


@router.post("/email/code", response_model=SimpleMessage)
@limiter.limit("3/minute")
async def send_email_code(request: Request, data: EmailCodeRequest, db: AsyncSession = Depends(get_db)):
    """6자리 코드를 메일로 보낸다. 가입 여부와 상관없이 같은 답을 준다."""
    await AuthService(db).send_code(data.email)
    return SimpleMessage(message="확인 코드를 보냈습니다. 메일함을 확인해주세요.")


@router.post("/email/link", response_model=LinkEmailResponse)
@limiter.limit("10/minute")
async def link_email(
    request: Request,
    data: EmailCodeVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """지금 계정에 이메일을 붙인다. 그 이메일의 계정이 이미 있으면 그쪽으로 합친다."""
    user, merged = await AuthService(db).link_email(current_user, data.email, data.code)
    tokens = issue_tokens(user)
    return LinkEmailResponse(
        access_token=tokens.access_token, refresh_token=tokens.refresh_token, merged=merged
    )


@router.post("/email/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login_with_email_code(
    request: Request, data: EmailCodeVerifyRequest, db: AsyncSession = Depends(get_db)
):
    """웹: 이메일 코드로 들어간다. 처음 보는 주소면 계정을 만든다."""
    return await AuthService(db).login_with_code(data.email, data.code)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    user = await service.register(data)
    return user


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    return await service.login(data)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    return await service.refresh_token(data.refresh_token)


@router.post("/forgot-password", response_model=SimpleMessage)
@limiter.limit("5/minute")
async def forgot_password(
    request: Request, data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
):
    """재설정 메일을 요청한다.

    가입되지 않은 주소여도 성공으로 답한다 — 응답이 갈리면 그것만으로
    가입자 명단을 확인할 수 있다(사용자 열거).
    """
    service = AuthService(db)
    await service.request_password_reset(data.email)
    return SimpleMessage(message="재설정 링크를 보냈습니다. 메일함을 확인해주세요.")


@router.post("/reset-password", response_model=SimpleMessage)
@limiter.limit("5/minute")
async def reset_password(
    request: Request, data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
):
    service = AuthService(db)
    await service.reset_password(data.token, data.new_password)
    return SimpleMessage(message="비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.")


@router.post("/verify-email", response_model=SimpleMessage)
@limiter.limit("10/minute")
async def verify_email(
    request: Request, data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)
):
    service = AuthService(db)
    await service.verify_email(data.token)
    return SimpleMessage(message="이메일 주소가 확인되었습니다.")


@router.post("/verify-email/resend", response_model=SimpleMessage)
@limiter.limit("3/minute")
async def resend_verification(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """로그인한 사용자가 인증 메일을 다시 받는다."""
    service = AuthService(db)
    await service.send_verification_email(current_user)
    return SimpleMessage(message="인증 메일을 다시 보냈습니다.")


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.username is not None:
        current_user.username = data.username

    email_changed = data.email is not None and data.email != current_user.email
    if email_changed:
        # 주소를 바꾸면 인증은 처음부터 다시 — 안 그러면 아무 주소나 넣고
        # '인증된 계정'으로 알림을 받을 수 있다.
        current_user.email = data.email
        current_user.email_verified = False

    await db.commit()
    await db.refresh(current_user)

    if email_changed:
        await AuthService(db).send_verification_email(current_user)
    return current_user


@router.delete("/me", response_model=SimpleMessage)
@limiter.limit("3/minute")
async def delete_me(
    request: Request,
    data: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """계정과 모든 데이터를 삭제한다 (복구 불가)."""
    service = AuthService(db)
    await service.delete_account(current_user, data.password, data.confirm)
    return SimpleMessage(message="계정이 삭제되었습니다. 그동안 이용해주셔서 감사합니다.")
