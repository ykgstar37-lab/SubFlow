from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr | None = None
    username: str
    is_active: bool
    email_verified: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdateRequest(BaseModel):
    username: str | None = None
    email: EmailStr | None = None
