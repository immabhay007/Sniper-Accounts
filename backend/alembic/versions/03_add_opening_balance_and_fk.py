"""add opening_balance and foreign key to tbl_fund_deposits

Revision ID: 03_add_opening_balance_and_fk
Revises: 02_add_added_by
Create Date: 2026-05-14 01:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mssql


# revision identifiers, used by Alembic.
revision = "03_add_opening_balance_and_fk"
down_revision = "02_add_added_by"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add opening_balance column with default value 0.0
    op.add_column(
        "tbl_fund_deposits",
        sa.Column("opening_balance", sa.Float(precision=53), nullable=False, server_default=sa.text("0.0")),
    )
    
    # Create foreign key constraint on added_by -> tbl_users.id
    op.create_foreign_key(
        constraint_name="fk_tbl_fund_deposits_added_by_tbl_users_id",
        source_table="tbl_fund_deposits",
        referent_table="tbl_users",
        local_cols=["added_by"],
        remote_cols=["id"],
        ondelete="SET NULL",
        onupdate="CASCADE",
    )


def downgrade() -> None:
    # Drop foreign key
    op.drop_constraint(
        constraint_name="fk_tbl_fund_deposits_added_by_tbl_users_id",
        table_name="tbl_fund_deposits",
        type_="foreignkey",
    )
    
    # Drop opening_balance column
    op.drop_column("tbl_fund_deposits", "opening_balance")
