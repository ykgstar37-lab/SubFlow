"""add user_id to service_plans

카탈로그 요금제만으로는 실제 요금제를 못 따라간다(멜론 이용권처럼 종류가
훨씬 많고 특가도 수시로 바뀐다). 사용자가 요금제를 직접 넣을 수 있게
service_plans에도 user_id를 붙인다. 카테고리·서비스와 같은 규칙으로
NULL은 기본 카탈로그, 값이 있으면 그 사람에게만 보이는 요금제다.

요금제를 구독에 그대로 복사하지 않고 진짜 plan 행으로 남기는 이유는,
plan_id가 있어야 요금 인상 이력과 절약 제안이 그 구독을 알아보기 때문이다.

Revision ID: d7a3c05e91bf
Revises: c9f2a41b70de
Create Date: 2026-08-29 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7a3c05e91bf'
down_revision: Union[str, None] = 'c9f2a41b70de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('service_plans', sa.Column('user_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_service_plans_user_id_users', 'service_plans', 'users', ['user_id'], ['id']
    )
    op.create_index('ix_service_plans_user_id', 'service_plans', ['user_id'], unique=False)


def downgrade() -> None:
    # 되돌리면 사용자 요금제가 모두에게 보이게 되므로 지운다. 구독은 남기고
    # 연결만 끊는다 — 이름·금액을 구독이 따로 들고 있어 화면은 그대로다.
    op.execute(
        "UPDATE subscriptions SET plan_id = NULL WHERE plan_id IN "
        "(SELECT id FROM service_plans WHERE user_id IS NOT NULL)"
    )
    op.execute(
        "DELETE FROM plan_price_history WHERE plan_id IN "
        "(SELECT id FROM service_plans WHERE user_id IS NOT NULL)"
    )
    op.execute("DELETE FROM service_plans WHERE user_id IS NOT NULL")

    op.drop_index('ix_service_plans_user_id', table_name='service_plans')
    op.drop_constraint('fk_service_plans_user_id_users', 'service_plans', type_='foreignkey')
    op.drop_column('service_plans', 'user_id')
