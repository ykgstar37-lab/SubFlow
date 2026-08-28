import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.subscription import BillingCycle


class ServicePlan(Base):
    __tablename__ = "service_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    service_id: Mapped[int] = mapped_column(Integer, ForeignKey("services.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="KRW")
    billing_cycle: Mapped[BillingCycle] = mapped_column(Enum(BillingCycle), default=BillingCycle.MONTHLY)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 이 가격에 부가세가 들어 있는지. 국내 소비자가는 총액표시제라 포함가지만,
    # 해외 웹 결제는 별도라 실제로 10%가 더 빠진다($20짜리가 $22로 청구된다).
    # 통화로 잘라 낼 수 없다 — 한국 앱스토어 인앱결제가는 USD여도 포함가다.
    # 그래서 요금제마다 들고 있는다. 구독을 담을 때 이 값으로 실결제액을 만든다.
    vat_included: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # 서비스·카테고리와 같은 규칙. NULL = 기본 카탈로그 요금제,
    # 값이 있으면 그 사람이 직접 넣은 요금제라 그 사람에게만 보인다.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )

    service = relationship("Service", back_populates="plans")
    price_history = relationship("PlanPriceHistory", back_populates="plan", order_by="PlanPriceHistory.effective_date")

    @property
    def is_custom(self) -> bool:
        return self.user_id is not None
