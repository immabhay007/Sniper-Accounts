"""create tbl_expenses_bills and drop bill_url from tbl_expenses

Revision ID: 05_create_tbl_expenses_bills
Revises: 04_create_tbl_expenses
Create Date: 2026-05-14 11:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "05_create_tbl_expenses_bills"
down_revision = "04_create_tbl_expenses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("tbl_expenses", "bill_url")

    op.create_table(
        "tbl_expenses_bills",
        sa.Column("id", sa.BigInteger(), sa.Identity(start=1, increment=1), primary_key=True, nullable=False),
        sa.Column("expense_id", sa.BigInteger(), nullable=False),
        sa.Column("bill_url", sa.Unicode(), nullable=False),
        sa.ForeignKeyConstraint(
            ["expense_id"],
            ["tbl_expenses.id"],
            name="fk_tbl_expenses_bills_expense_id_tbl_expenses_id",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
    )


def downgrade() -> None:
    op.drop_table("tbl_expenses_bills")
    op.add_column(
        "tbl_expenses",
        sa.Column("bill_url", sa.Unicode(), nullable=True),
    )