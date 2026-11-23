"""device accounts and email codes

앱 로그인을 없앤다. 앱을 처음 열면 이메일·비밀번호 없는 기기 계정이 생기고,
원하면 이메일을 6자리 코드로 인증해 붙인다. 그래서 email·hashed_password를
비울 수 있게 하고, 코드를 담을 email_codes 테이블과 토큰 무효화용 token_version을 둔다.

Revision ID: c5e8a1f4b9d2
Revises: b3d7f1a2c605
Create Date: 2026-11-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c5e8a1f4b9d2'
down_revision: Union[str, None] = 'b3d7f1a2c605'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('users', 'email', existing_type=sa.String(length=255), nullable=True)
    op.alter_column('users', 'hashed_password', existing_type=sa.String(length=255), nullable=True)
    op.add_column('users', sa.Column('token_version', sa.Integer(), server_default='0', nullable=False))
    op.create_table(
        'email_codes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('code_hash', sa.String(length=64), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_email_codes_email', 'email_codes', ['email'])


def downgrade() -> None:
    op.drop_index('ix_email_codes_email', table_name='email_codes')
    op.drop_table('email_codes')
    op.drop_column('users', 'token_version')
    # 기기 계정(이메일 없음)이 남아 있으면 되돌릴 수 없다
    op.alter_column('users', 'hashed_password', existing_type=sa.String(length=255), nullable=False)
    op.alter_column('users', 'email', existing_type=sa.String(length=255), nullable=False)
