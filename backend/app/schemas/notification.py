from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class NotificationItem(BaseModel):
    id: UUID
    type: str
    title: str
    body: str | None = None
    category: str | None = None
    link: str | None = None
    image_url: str | None = None
    action_url: str | None = None
    action_label: str | None = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class InboxResponse(BaseModel):
    items: list[NotificationItem]
    unread_count: int


class MarkReadResponse(BaseModel):
    updated: int


class PushTokenRequest(BaseModel):
    push_token: str | None = None


class NotificationSettingsResponse(BaseModel):
    id: UUID
    user_id: UUID
    notify_days_before: int
    email_notifications: bool
    push_notifications: bool
    budget_monthly: int | None = None
    budget_alerts: bool = True
    fx_alerts: bool = True
    # 푸시를 켜 두어도 기기 토큰이 없으면 아무것도 못 보낸다. 웹에서 켜 놓고
    # 왜 안 오는지 모르는 상황을 없애려고 연결 여부만 알려 준다(토큰은 감춘다).
    push_device_connected: bool = False

    model_config = {"from_attributes": True}


class NotificationSettingsUpdateRequest(BaseModel):
    notify_days_before: int | None = Field(default=None, ge=1, le=30)
    email_notifications: bool | None = None
    push_notifications: bool | None = None
    budget_monthly: int | None = None
    budget_alerts: bool | None = None
    fx_alerts: bool | None = None
