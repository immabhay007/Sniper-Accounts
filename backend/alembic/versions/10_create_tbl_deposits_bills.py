"""create tbl_deposits_bills table

Revision ID: 10_create_tbl_deposits_bills
Revises: 09_make_fund_deposits_history
Create Date: 2026-05-19 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mssql


# revision identifiers, used by Alembic.
revision = "10_create_tbl_deposits_bills"
down_revision = "09_make_fund_deposits_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tbl_deposits_bills",
        sa.Column("id", mssql.BIGINT(), sa.Identity(start=1, increment=1), primary_key=True, nullable=False),
        sa.Column("deposit_id", mssql.BIGINT(), nullable=False),
        sa.Column("bill_url", mssql.NVARCHAR(length=None), nullable=False),
        sa.ForeignKeyConstraint(
            ["deposit_id"],
            ["tbl_fund_deposits_history.id"],
            name="fk_tbl_deposits_bills_deposit_id_tbl_fund_deposits_history_id",
            onupdate="CASCADE",
        ),
    )


def downgrade() -> None:
    op.drop_table("tbl_deposits_bills")
