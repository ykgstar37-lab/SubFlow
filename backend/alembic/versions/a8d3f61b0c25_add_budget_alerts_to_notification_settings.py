"""add budget_alerts to notification_settings

예산 초과 알림을 끌 방법이 없었다. 예산 자체를 지우는 것 말고는 방법이
없어서, 예산은 보고 싶은데 알림은 싫은 사람이 갈 곳이 없었다.

기존 사용자는 지금까지 받아 왔으므로 켜진 상태로 채운다.

Revision ID: a8d3f61b0c25
Revises: f2a5c19e04b7
Create Date: 2026-08-31 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8d3f61b0c25'
down_revision: Union[str, None] = 'f2a5c19e04b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'notification_settings',
        sa.Column('budget_alerts', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )


def downgrade() -> None:
    op.drop_column('notification_settings', 'budget_alerts')
