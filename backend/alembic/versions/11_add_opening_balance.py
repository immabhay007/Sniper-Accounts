"""add opening_balance to tbl_fund_deposits

Revision ID: 11_add_opening_balance
Revises: 10_create_tbl_deposits_bills
Create Date: 2026-05-19 16:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "11_add_opening_balance"
down_revision = "10_create_tbl_deposits_bills"
branch_labels = None
depends_on = None


def _drop_default_constraint_mssql(table_name: str, column_name: str) -> None:
    bind = op.get_bind()
    if bind.dialect.name != "mssql":
        return
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
    op.add_column(
        "tbl_fund_deposits",
        sa.Column("opening_balance", sa.Float(precision=53), nullable=False, server_default=sa.text("0.0")),
    )


def downgrade() -> None:
    _drop_default_constraint_mssql("tbl_fund_deposits", "opening_balance")
    op.drop_column("tbl_fund_deposits", "opening_balance")