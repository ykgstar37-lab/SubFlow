"""add sort_order to categories

분류 목록이 생성 순(id)으로 나왔다. 그래서 나중에 만든 분류는 늘 끝에 붙는다
— AI를 새로 만들었더니 맨 뒤에 놓였다. 화면 순서를 id와 떼어 놓는다.

기본 카탈로그 분류는 시드가 DEFAULT_CATEGORIES 순서대로 0부터 매긴다.
사용자가 만든 분류는 기본값 1000이라 기본 분류 뒤에, 자기들끼리는 만든
순서(id)로 놓인다.

Revision ID: f2a5c19e04b7
Revises: e4b1c78d3a20
Create Date: 2026-08-29 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2a5c19e04b7'
down_revision: Union[str, None] = 'e4b1c78d3a20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 기존 행은 전부 1000으로 두고, 곧바로 도는 시드가 기본 분류에 제 순서를
    # 매긴다. 여기서 이름으로 순서를 박아 넣으면 시드와 두 곳에서 관리하게 된다.
    op.add_column(
        'categories',
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='1000'),
    )


def downgrade() -> None:
    op.drop_column('categories', 'sort_order')
