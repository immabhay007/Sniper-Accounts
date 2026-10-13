"""drop opening_balance from tbl_fund_deposits

Revision ID: 06_drop_opening_balance
Revises: 05_create_tbl_expenses_bills
Create Date: 2026-05-15 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "06_drop_opening_balance"
down_revision = "05_create_tbl_expenses_bills"
branch_labels = None
depends_on = None


def _drop_default_constraints(table_name: str, column_name: str) -> None:
    """Drop any default constraints on a column in SQL Server before dropping the column."""
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            """
            SELECT dc.name
            FROM sys.default_constraints dc
            JOIN sys.columns c ON dc.parent_object_id = c.object_id
                AND dc.parent_column_id = c.column_id
            JOIN sys.tables t ON c.object_id = t.object_id
            WHERE t.name = :table AND c.name = :column
            """
        ),
        {"table": table_name, "column": column_name},
    )
    for row in result:
        bind.execute(sa.text(f"ALTER TABLE [{table_name}] DROP CONSTRAINT [{row[0]}]"))


def upgrade() -> None:
    _drop_default_constraints("tbl_fund_deposits", "opening_balance")
    op.drop_column("tbl_fund_deposits", "opening_balance")


def downgrade() -> None:
    op.add_column(
        "tbl_fund_deposits",
        sa.Column("opening_balance", sa.Float(precision=53), nullable=False, server_default=sa.text("0.0")),
    )
