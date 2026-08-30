"""add fx_alerts to notification_settings

환율 변동 알림도 끌 수 없었다. 설정에 '환율 알림' 행이 있긴 했는데 분석
화면으로 보내기만 했고(그쪽엔 환율 얘기가 없다) 알림 자체는 손댈 수 없었다.
예산 알림(budget_alerts)과 같은 방식으로 스위치를 붙인다.

기존 사용자는 지금까지 받아 왔으므로 켜진 상태로 채운다.

Revision ID: c1e7b409af62
Revises: a8d3f61b0c25
Create Date: 2026-08-31 04:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1e7b409af62'
down_revision: Union[str, None] = 'a8d3f61b0c25'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'notification_settings',
        sa.Column('fx_alerts', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )


def downgrade() -> None:
    op.drop_column('notification_settings', 'fx_alerts')
