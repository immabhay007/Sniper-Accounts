"""create tbl_expenses table

Revision ID: 04_create_tbl_expenses
Revises: 03_add_opening_balance_and_fk
Create Date: 2026-05-14 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mssql


# revision identifiers, used by Alembic.
revision = "04_create_tbl_expenses"
down_revision = "03_add_opening_balance_and_fk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tbl_expenses",
        sa.Column("id", mssql.BIGINT(), sa.Identity(start=1, increment=1), primary_key=True, nullable=False),
        sa.Column("fund_account_id", mssql.BIGINT(), nullable=False),
        sa.Column("date_of_expense", mssql.DATETIME(), nullable=False),
        sa.Column("purpose", mssql.NVARCHAR(length=None), nullable=False),
        sa.Column("withdrawn_amount", sa.Float(precision=53), nullable=False),
        sa.Column("returned_amount", sa.Float(precision=53), nullable=False, server_default=sa.text("0.0")),
        sa.Column("running_balance", sa.Float(precision=53), nullable=False),
        sa.Column("category_tage", mssql.NVARCHAR(length=None), nullable=False),
        sa.Column("payment_by", mssql.NVARCHAR(length=None), nullable=False),
        sa.Column("created_by", mssql.BIGINT(), nullable=True),
        sa.Column("updated_by", mssql.BIGINT(), nullable=True),
        sa.Column("updated_at", mssql.DATETIME(), nullable=False),
        sa.Column("bill_url", mssql.NVARCHAR(length=None), nullable=True),
        sa.ForeignKeyConstraint(
            ["fund_account_id"],
            ["tbl_fund_deposits.id"],
            name="fk_tbl_expenses_fund_account_id_tbl_fund_deposits_id",
            onupdate="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["tbl_users.id"],
            name="fk_tbl_expenses_created_by_tbl_users_id",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["tbl_users.id"],
            name="fk_tbl_expenses_updated_by_tbl_users_id",
        ),
    )


def downgrade() -> None:
    op.drop_table("tbl_expenses")