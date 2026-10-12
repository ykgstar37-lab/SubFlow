"""add contract_end_date to subscriptions

렌탈(정수기·공기청정기 등)은 3~6년 의무사용기간이 있다. 끝나는 날을
알아야 남은 개월 수·금액과 종료 알림을 보여 줄 수 있다.

Revision ID: a9c4e2d81f30
Revises: c1e7b409af62
Create Date: 2026-10-12 21:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9c4e2d81f30'
down_revision: Union[str, None] = 'c1e7b409af62'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('subscriptions', sa.Column('contract_end_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('subscriptions', 'contract_end_date')
