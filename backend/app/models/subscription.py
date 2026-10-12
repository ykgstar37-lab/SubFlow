import enum
import uuid
from datetime import date, datetime

from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class BillingCycle(str, enum.Enum):
    MONTHLY = "monthly"
    YEARLY = "yearly"
    WEEKLY = "weekly"
    QUARTERLY = "quarterly"


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    TRIAL = "trial"


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        Index("ix_subscriptions_user_status", "user_id", "status"),
        Index("ix_subscriptions_user_billing", "user_id", "next_billing_date"),
        Index("ix_subscriptions_user_category", "user_id", "category_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    category_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("categories.id"), nullable=True)
    service_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="KRW")
    billing_cycle: Mapped[BillingCycle] = mapped_column(Enum(BillingCycle), nullable=False)
    billing_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    next_billing_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[SubscriptionStatus] = mapped_column(Enum(SubscriptionStatus), default=SubscriptionStatus.ACTIVE)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    is_recurring: Mapped[bool] = mapped_column(Boolean, default=True)
    cancel_reminder: Mapped[bool] = mapped_column(Boolean, default=False)

    # 공유/가족 구독: 비용을 나눠 내는 인원 수 (1 = 단독). 내 몫 = cost / member_count
    # 렌탈처럼 의무사용기간이 있는 구독의 약정 종료일. 없으면 약정 없음.
    # 끝나면 소유권이 넘어오거나 렌탈료가 내려가므로 종료 전에 알려 준다.
    contract_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 렌탈 기기 종류("정수기")와 그 아이콘(이모지). 같은 업체에서 정수기와 비데를
    # 함께 빌리면 이게 없을 때 목록에서 둘을 구분할 수 없다. 목록에 없는 기기는
    # 사용자가 이름·아이콘을 직접 정하므로 정해진 코드가 아니라 문자열로 둔다.
    rental_item: Mapped[str | None] = mapped_column(String(30), nullable=True)
    rental_item_icon: Mapped[str | None] = mapped_column(String(16), nullable=True)
    member_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False, server_default="1")

    initial_exchange_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)

    service_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("services.id"), nullable=True)
    plan_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("service_plans.id"), nullable=True)

    @property
    def personal_cost(self) -> Decimal:
        """분담 인원을 반영한 1인당(내) 비용."""
        count = self.member_count or 1
        return Decimal(str(self.cost)) / count

    user = relationship("User", back_populates="subscriptions")
    category = relationship("Category", back_populates="subscriptions")
    service = relationship("Service")
    plan = relationship("ServicePlan")
    payments = relationship("PaymentHistory", back_populates="subscription", cascade="all, delete-orphan")
