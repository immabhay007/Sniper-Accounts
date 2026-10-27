"""12_create_tbl_reset_password_otp

Revision ID: 12_create_tbl_reset_password_otp
Revises: 11_add_opening_balance
Create Date: 2026-05-25 17:34:27.535173
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "12_create_tbl_reset_password_otp"
down_revision: Union[str, None] = "11_add_opening_balance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tbl_reset_password_otp",
        sa.Column("id", sa.Integer(), sa.Identity(start=1, increment=1), primary_key=True, nullable=False),
        sa.Column("email", sa.Unicode(length=255), nullable=False),
        sa.Column("otp", sa.Unicode(length=50), nullable=False),
        sa.Column("expiry", sa.DateTime(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("tbl_reset_password_otp")