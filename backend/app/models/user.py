import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # 앱은 로그인 없이 기기 계정으로 시작한다. 이메일은 사용자가 원할 때 6자리 코드로
    # 인증해서 붙이고, 그 이메일로 웹에 들어간다. 그래서 둘 다 비어 있을 수 있다.
    # 비밀번호는 예전 가입자에게만 남아 있다 (구버전 앱의 로그인 화면용).
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 미인증이어도 앱은 그대로 쓸 수 있다. 다만 이 주소로 알림 메일을 보내지 않는다
    # — 오타로 가입한 주소에 남의 구독 내역이 가는 것을 막는다.
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 리프레시 토큰에 이 값을 심는다. 올리면 그때까지 나간 토큰이 전부 무효가 된다.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    subscriptions = relationship("Subscription", back_populates="user", cascade="all, delete-orphan")
    notification_setting = relationship("NotificationSetting", back_populates="user", uselist=False, cascade="all, delete-orphan")
