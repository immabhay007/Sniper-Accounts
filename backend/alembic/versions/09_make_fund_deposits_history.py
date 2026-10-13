"""make tbl_fund_deposits_history.added_by nvarchar without foreign key

Revision ID: 09_make_fund_deposits_history
Revises: 08_create_tbl_fund
Create Date: 2026-05-19 13:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mssql


# revision identifiers, used by Alembic.
revision = "09_make_fund_deposits_history"
down_revision = "08_create_tbl_fund"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            IF EXISTS (
                SELECT 1
                FROM sys.foreign_keys
                WHERE name = 'fk_tbl_fund_deposits_history_added_by_tbl_users_id'
            )
            BEGIN
                ALTER TABLE dbo.tbl_fund_deposits_history
                DROP CONSTRAINT fk_tbl_fund_deposits_history_added_by_tbl_users_id;
            END
            """
        )
    )

    op.alter_column(
        "tbl_fund_deposits_history",
        "added_by",
        existing_type=mssql.BIGINT(),
        type_=mssql.NVARCHAR(length=None),
        existing_nullable=True,
        nullable=True,
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE dbo.tbl_fund_deposits_history
            SET added_by = NULL
            WHERE added_by IS NOT NULL
              AND TRY_CONVERT(BIGINT, added_by) IS NULL;
            """
        )
    )

    op.alter_column(
        "tbl_fund_deposits_history",
        "added_by",
        existing_type=mssql.NVARCHAR(length=None),
        type_=mssql.BIGINT(),
        existing_nullable=True,
        nullable=True,
    )

    op.execute(
        sa.text(
            """
            IF NOT EXISTS (
                SELECT 1
                FROM sys.foreign_keys
                WHERE name = 'fk_tbl_fund_deposits_history_added_by_tbl_users_id'
            )
            BEGIN
                ALTER TABLE dbo.tbl_fund_deposits_history
                ADD CONSTRAINT fk_tbl_fund_deposits_history_added_by_tbl_users_id
                FOREIGN KEY (added_by) REFERENCES dbo.tbl_users(id)
                ON DELETE NO ACTION
                ON UPDATE NO ACTION;
            END
            """
        )
    )
