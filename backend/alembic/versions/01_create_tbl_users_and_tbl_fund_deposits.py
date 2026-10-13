"""create tbl_users and tbl_fund_deposits tables

Revision ID: 01_added_tables
Revises: 
Create Date: 2026-05-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mssql


# revision identifiers, used by Alembic.
revision = "01_added_tables"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tbl_users",
        sa.Column("id", mssql.BIGINT(), sa.Identity(start=1, increment=1), primary_key=True, nullable=False),
        sa.Column("first_name", mssql.NVARCHAR(length=255), nullable=False),
        sa.Column("last_name", mssql.NVARCHAR(length=255), nullable=False),
        sa.Column("email", mssql.NVARCHAR(length=255), nullable=False),
        sa.Column("hashed_password", mssql.NVARCHAR(length=255), nullable=False),
        sa.Column("phone", mssql.NVARCHAR(length=50), nullable=True),
        sa.Column("role", mssql.NVARCHAR(length=100), nullable=False),
        sa.Column("created_at", mssql.DATETIME(), nullable=False),
        sa.Column("updated_at", mssql.DATETIME(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
    )

    op.create_table(
        "tbl_fund_deposits",
        sa.Column("id", mssql.BIGINT(), sa.Identity(start=1, increment=1), primary_key=True, nullable=False),
        sa.Column("fund_account", mssql.NVARCHAR(length=None), nullable=False),
        sa.Column("budgeted_fund", sa.Float(precision=53), nullable=False),
        sa.Column("deposited_fund", sa.Float(precision=53), nullable=False),
        sa.Column("date_of_deposit", mssql.DATETIME(), nullable=False),
        sa.Column("mode_of_transfer", mssql.NVARCHAR(length=255), nullable=False),
        sa.Column("remarks", mssql.NVARCHAR(length=None), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("tbl_fund_deposits")
    op.drop_table("tbl_users")