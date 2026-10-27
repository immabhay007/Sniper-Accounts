"""make tbl_fund_deposits_history.added_by nvarchar without foreign key

Revision ID: 09_make_fund_deposits_history
Revises: 08_create_tbl_fund
Create Date: 2026-05-19 13:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "09_make_fund_deposits_history"
down_revision = "08_create_tbl_fund"
branch_labels = None
depends_on = None


_FK_NAME = "fk_tbl_fund_deposits_history_added_by_tbl_users_id"


def _fk_exists() -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(fk["name"] == _FK_NAME for fk in inspector.get_foreign_keys("tbl_fund_deposits_history"))


def upgrade() -> None:
    if _fk_exists():
        op.drop_constraint(_FK_NAME, "tbl_fund_deposits_history", type_="foreignkey")

    op.alter_column(
        "tbl_fund_deposits_history",
        "added_by",
        existing_type=sa.BigInteger(),
        type_=sa.Unicode(),
        existing_nullable=True,
        nullable=True,
    )


def downgrade() -> None:
    bind = op.get_bind()

    # Null out any non-numeric values before narrowing to BIGINT
    if bind.dialect.name == "mssql":
        bind.execute(sa.text(
            """
            UPDATE dbo.tbl_fund_deposits_history
            SET added_by = NULL
            WHERE added_by IS NOT NULL AND TRY_CONVERT(BIGINT, added_by) IS NULL;
            """
        ))
    else:
        bind.execute(sa.text(
            """
            UPDATE tbl_fund_deposits_history
            SET added_by = NULL
            WHERE added_by IS NOT NULL AND added_by !~ '^-?[0-9]+$';
            """
        ))

    op.alter_column(
        "tbl_fund_deposits_history",
        "added_by",
        existing_type=sa.Unicode(),
        type_=sa.BigInteger(),
        existing_nullable=True,
        nullable=True,
    )

    if not _fk_exists():
        op.create_foreign_key(
            _FK_NAME,
            "tbl_fund_deposits_history",
            "tbl_users",
            ["added_by"],
            ["id"],
        )