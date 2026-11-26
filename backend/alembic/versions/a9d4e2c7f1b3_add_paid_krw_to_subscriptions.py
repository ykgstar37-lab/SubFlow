"""add paid_krw to subscriptions

외화 구독이 카드에 실제로 찍힌 원화 금액. 사용자가 '환산 금액과 달라요'로 직접 넣는다.

Revision ID: a9d4e2c7f1b3
Revises: c5e8a1f4b9d2
Create Date: 2026-11-26 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a9d4e2c7f1b3'
down_revision: Union[str, None] = 'c5e8a1f4b9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('subscriptions', sa.Column('paid_krw', sa.Numeric(precision=12, scale=0), nullable=True))


def downgrade() -> None:
    op.drop_column('subscriptions', 'paid_krw')
