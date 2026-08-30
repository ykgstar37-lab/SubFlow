from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.category import Category
from app.models.service import Service
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.category import CategoryCreateRequest, CategoryResponse

router = APIRouter()


def _visible_to(user: User):
    """기본 카탈로그(user_id IS NULL)와 내가 만든 것만 보이게 하는 조건."""
    return or_(Category.user_id.is_(None), Category.user_id == user.id)


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Category)
        .where(_visible_to(current_user))
        .order_by(Category.sort_order, Category.id)
    )
    return result.scalars().all()


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: CategoryCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 내 눈에 보이는 범위에서만 이름이 겹치는지 본다. 남이 만든 "운동"은
    # 애초에 내 목록에 없으므로 막을 이유가 없다.
    existing = await db.execute(
        select(Category).where(Category.name == data.name, _visible_to(current_user))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category already exists")

    category = Category(**data.model_dump(), is_default=False, user_id=current_user.id)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내가 만든 카테고리를 지운다. 기본 카탈로그는 지울 수 없다."""
    result = await db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == current_user.id)
    )
    category = result.scalar_one_or_none()
    if not category:
        # 기본 카테고리든 남의 것이든 "없는 것"으로 답한다.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    # 이 카테고리를 쓰던 구독과 서비스는 지우지 않고 분류만 뗀다.
    # 카테고리 하나 지웠다고 구독 기록이 사라지면 곤란하다.
    await db.execute(
        update(Subscription)
        .where(Subscription.category_id == category_id)
        .values(category_id=None)
    )
    await db.execute(
        update(Service).where(Service.category_id == category_id).values(category_id=None)
    )
    await db.delete(category)
    await db.commit()
