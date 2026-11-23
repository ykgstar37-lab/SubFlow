from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=100)
    username: str = Field(min_length=2, max_length=100)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not any(c.isalpha() for c in v):
            raise ValueError("비밀번호에 영문자를 최소 1자 포함해야 합니다.")
        if not any(c.isdigit() for c in v):
            raise ValueError("비밀번호에 숫자를 최소 1자 포함해야 합니다.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=100)

    # 가입 때와 같은 강도 규칙을 쓴다 — 재설정으로 우회되면 의미가 없다
    _check = field_validator("new_password")(
        RegisterRequest.validate_password_strength.__func__
    )


class VerifyEmailRequest(BaseModel):
    token: str


class DeleteAccountRequest(BaseModel):
    """계정 삭제는 되돌릴 수 없으므로 한 번 더 확인받는다.

    구버전 앱은 비밀번호를 보낸다. 새 앱은 로그인이 없어 비밀번호가 없으므로
    화면에서 한 번 더 누른 confirm=true를 보낸다.
    """

    password: str | None = None
    confirm: bool = False


class SimpleMessage(BaseModel):
    message: str


class EmailCodeRequest(BaseModel):
    email: EmailStr


class EmailCodeVerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class LinkEmailResponse(BaseModel):
    """이메일을 붙인 결과. merged면 이미 있던 계정으로 갈아탔으니 새 토큰을 써야 한다."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    merged: bool
