"""add added_by column to tbl_fund_deposits

Revision ID: 02_add_added_by
Revises: 01_added_tables
Create Date: 2026-05-14 00:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mssql


# revision identifiers, used by Alembic.
revision = "02_add_added_by"
down_revision = "01_added_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tbl_fund_deposits",
        sa.Column("added_by", mssql.BIGINT(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tbl_fund_deposits", "added_by")