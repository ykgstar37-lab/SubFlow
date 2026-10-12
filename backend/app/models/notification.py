import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class NotificationType(str, enum.Enum):
    OVERLAP = "overlap"            # 카테고리 중복 구독
    PRICE_CHANGE = "price_change"  # 내 구독 요금 변경 (plan_price_history diff)
    AI_NEWS = "ai_news"            # AI/에이전트 릴리즈 소식
    PRICE_NEWS = "price_news"      # 구독 요금 인상 뉴스
    TRIAL_EXPIRY = "trial_expiry"  # 무료 체험 만료 임박
    BUDGET = "budget"              # 예산 초과
    RENEWAL = "renewal"            # 결제 임박
    EXCHANGE_RATE = "exchange_rate"  # 환율 변동
    CONTRACT_END = "contract_end"  # 렌탈 등 약정 종료 임박


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)   # UI 라벨: "구독 알림", "AI 소식"
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)      # 딥링크 or 외부 URL
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # 액션형 CTA (예: 해지 가이드) — 외부 URL + 버튼 라벨
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    action_label: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # 파생 알림(중복/가격 등) 중복 삽입 방지 키. 예) "overlap:3"
    dedup_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 푸시/이메일로 실제 발송된 시각 (중복 발송 방지)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User")

    __table_args__ = (
        # 같은 사용자 + 같은 dedup_key는 하나만 (dedup_key가 NULL이면 제약 없음)
        UniqueConstraint("user_id", "dedup_key", name="uq_notification_user_dedup"),
    )
