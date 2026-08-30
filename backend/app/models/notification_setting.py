import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class NotificationSetting(Base):
    __tablename__ = "notification_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    notify_days_before: Mapped[int] = mapped_column(Integer, default=3)
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    push_notifications: Mapped[bool] = mapped_column(Boolean, default=False)
    budget_monthly: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    # 예산 초과 알림만 따로 끌 수 있게 한다. 예산은 보고 싶은데 알림은 싫은
    # 사람이 있는데, 지금까지는 예산을 지우는 것 말고는 끌 방법이 없었다.
    budget_alerts: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    push_token: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)  # Expo 푸시 토큰
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="notification_setting")

    @property
    def push_device_connected(self) -> bool:
        """푸시를 보낼 기기가 붙어 있는지. 토큰 자체는 밖으로 내보내지 않는다."""
        return bool(self.push_token)
