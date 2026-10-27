"""create tbl_users and tbl_fund_deposits tables

Revision ID: 01_added_tables
Revises:
Create Date: 2026-05-14 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "01_added_tables"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tbl_users",
        sa.Column("id", sa.BigInteger(), sa.Identity(start=1, increment=1), primary_key=True, nullable=False),
        sa.Column("first_name", sa.Unicode(length=255), nullable=False),
        sa.Column("last_name", sa.Unicode(length=255), nullable=False),
        sa.Column("email", sa.Unicode(length=255), nullable=False),
        sa.Column("hashed_password", sa.Unicode(length=255), nullable=False),
        sa.Column("phone", sa.Unicode(length=50), nullable=True),
        sa.Column("role", sa.Unicode(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "tbl_fund_deposits",
        sa.Column("id", sa.BigInteger(), sa.Identity(start=1, increment=1), primary_key=True, nullable=False),
        sa.Column("fund_account", sa.Unicode(), nullable=False),
        sa.Column("budgeted_fund", sa.Float(precision=53), nullable=False),
        sa.Column("deposited_fund", sa.Float(precision=53), nullable=False),
        sa.Column("date_of_deposit", sa.DateTime(), nullable=False),
        sa.Column("mode_of_transfer", sa.Unicode(length=255), nullable=False),
        sa.Column("remarks", sa.Unicode(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("tbl_fund_deposits")
    op.drop_table("tbl_users")