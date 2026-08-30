import hashlib
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def password_fingerprint(password_hash: str) -> str:
    """비밀번호 해시를 짧게 줄인 값. 리프레시 토큰에 함께 넣어 둔다.

    리프레시 토큰은 따로 보관하지 않는 JWT라 한 번 새 나가면 만료까지 막을
    방법이 없다. 지문을 심어 두면 비밀번호를 바꾸는 순간 기존 토큰이 전부
    무효가 된다 — 기기를 잃어버렸을 때 손쓸 수 있는 유일한 수단이다.
    """
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


# ── 비밀번호 재설정 토큰 ────────────────────────────────────────────────
# 별도 테이블 없이 '한 번만 쓰이는' 링크를 만든다.
# 서명 키에 현재 비밀번호 해시를 섞어 두면, 비밀번호가 바뀌는 순간 같은 토큰의
# 서명이 더 이상 맞지 않는다 → 재사용 불가. 메일이 새어도 창(30분)만 위험하다.
PASSWORD_RESET_EXPIRE_MINUTES = 30


def _reset_key(current_password_hash: str) -> str:
    return f"{settings.SECRET_KEY}:{current_password_hash}"


def create_password_reset_token(user_id: str, current_password_hash: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire, "type": "pwreset"}
    return jwt.encode(payload, _reset_key(current_password_hash), algorithm=settings.ALGORITHM)


def decode_password_reset_token(token: str, current_password_hash: str) -> dict | None:
    """유효하면 payload, 아니면 None. 만료·위조·이미 사용됨을 모두 여기서 거른다."""
    try:
        payload = jwt.decode(
            token, _reset_key(current_password_hash), algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        return None
    return payload if payload.get("type") == "pwreset" else None


# ── 이메일 인증 토큰 ────────────────────────────────────────────────────
# 재설정 토큰과 같은 발상. 서명 키에 '인증 대상 주소'를 섞어, 주소를 바꾸면
# 예전 링크가 죽는다. 인증이 끝나면 email_verified로 한 번 더 걸러 재사용을 막는다.
EMAIL_VERIFY_EXPIRE_HOURS = 48


def _verify_key(email: str) -> str:
    return f"{settings.SECRET_KEY}:verify:{email.lower()}"


def create_email_verify_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFY_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "exp": expire, "type": "verify"}
    return jwt.encode(payload, _verify_key(email), algorithm=settings.ALGORITHM)


def decode_email_verify_token(token: str, email: str) -> dict | None:
    try:
        payload = jwt.decode(token, _verify_key(email), algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    return payload if payload.get("type") == "verify" else None


def peek_token_subject(token: str) -> str | None:
    """서명 검증 없이 sub만 꺼낸다 — 어느 사용자의 해시로 검증할지 찾기 위해서만 쓴다.
    여기서 꺼낸 값은 신뢰하지 않는다. 실제 검증은 decode_password_reset_token이 한다."""
    try:
        return jwt.get_unverified_claims(token).get("sub")
    except JWTError:
        return None
