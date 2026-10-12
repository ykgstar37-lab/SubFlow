"""add rental_item to subscriptions

렌탈 기기 종류(정수기·공기청정기 등)와 아이콘. 같은 업체에서 기기를
여럿 빌리면 목록에서 구분할 수 있어야 한다.

Revision ID: b3d7f1a2c605
Revises: a9c4e2d81f30
Create Date: 2026-10-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3d7f1a2c605'
down_revision: Union[str, None] = 'a9c4e2d81f30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('subscriptions', sa.Column('rental_item', sa.String(length=30), nullable=True))
    op.add_column('subscriptions', sa.Column('rental_item_icon', sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column('subscriptions', 'rental_item_icon')
    op.drop_column('subscriptions', 'rental_item')
