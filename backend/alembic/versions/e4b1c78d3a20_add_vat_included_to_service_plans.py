"""add vat_included to service_plans

카탈로그 가격이 두 종류로 섞여 있었다. 국내 소비자가는 총액표시제라 부가세
포함가인데, 해외 웹 결제는 별도라 청구서에 10%가 더 붙는다(Claude Pro
$20 + tax $2 = $22). 구분이 없어 월 지출 합계가 구조적으로 덜 잡혔다.

통화로 잘라 낼 수 없다 — 한국 앱스토어 인앱결제가는 이미 포함가다. 그래서
요금제마다 값을 들고 있고, 구독을 담을 때 이 값으로 실결제액을 만든다.

기존 행은 통화로 채운다(KRW=포함, 그 외=별도). 예외는 시드가 다시 돌면서
바로잡는다.

Revision ID: e4b1c78d3a20
Revises: d7a3c05e91bf
Create Date: 2026-08-29 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4b1c78d3a20'
down_revision: Union[str, None] = 'd7a3c05e91bf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'service_plans',
        sa.Column('vat_included', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )
    # 사용자가 직접 넣은 요금제(user_id 있음)는 청구서에 찍힌 실결제액이므로
    # 기본값 true를 그대로 둔다. 카탈로그 요금제만 통화로 나눈다.
    op.execute(
        "UPDATE service_plans SET vat_included = false "
        "WHERE user_id IS NULL AND currency <> 'KRW'"
    )


def downgrade() -> None:
    op.drop_column('service_plans', 'vat_included')
