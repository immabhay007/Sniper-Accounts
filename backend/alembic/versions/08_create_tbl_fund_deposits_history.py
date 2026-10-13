"""create tbl_fund_deposits_history and ensure identity ids

Revision ID: 08_create_tbl_fund
Revises: 07_remove_opening_balance
Create Date: 2026-05-19 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mssql


# revision identifiers, used by Alembic.
revision = "08_create_tbl_fund"
down_revision = "07_remove_opening_balance"
branch_labels = None
depends_on = None


def _drop_related_foreign_keys() -> None:
    op.execute(
        sa.text(
            """
            DECLARE @sql NVARCHAR(MAX) = N'';

            SELECT @sql = @sql + N'ALTER TABLE [' + SCHEMA_NAME(pt.schema_id) + N'].[' + pt.name + N'] DROP CONSTRAINT [' + fk.name + N'];'
            FROM sys.foreign_keys fk
            JOIN sys.tables pt ON fk.parent_object_id = pt.object_id
            JOIN sys.tables rt ON fk.referenced_object_id = rt.object_id
            WHERE pt.name IN ('tbl_users', 'tbl_fund_deposits', 'tbl_expenses', 'tbl_expenses_bills')
               OR rt.name IN ('tbl_users', 'tbl_fund_deposits', 'tbl_expenses', 'tbl_expenses_bills');

            IF LEN(@sql) > 0
            BEGIN
                EXEC sp_executesql @sql;
            END
            """
        )
    )


def _has_non_identity_ids() -> bool:
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            """
            SELECT CASE
                WHEN EXISTS (
                    SELECT 1
                    WHERE COLUMNPROPERTY(OBJECT_ID(N'dbo.tbl_users'), 'id', 'IsIdentity') = 0
                       OR COLUMNPROPERTY(OBJECT_ID(N'dbo.tbl_fund_deposits'), 'id', 'IsIdentity') = 0
                       OR COLUMNPROPERTY(OBJECT_ID(N'dbo.tbl_expenses'), 'id', 'IsIdentity') = 0
                       OR COLUMNPROPERTY(OBJECT_ID(N'dbo.tbl_expenses_bills'), 'id', 'IsIdentity') = 0
                )
                THEN 1 ELSE 0
            END AS needs_rebuild;
            """
        )
    )
    return bool(result.scalar())


def _ensure_identity_ids() -> None:
    op.execute(
        sa.text(
            """
            IF OBJECT_ID(N'dbo.tbl_users', N'U') IS NOT NULL
               AND COLUMNPROPERTY(OBJECT_ID(N'dbo.tbl_users'), 'id', 'IsIdentity') = 0
            BEGIN
                CREATE TABLE dbo.tbl_users__tmp_identity (
                    id BIGINT IDENTITY(1,1) NOT NULL,
                    first_name NVARCHAR(255) NOT NULL,
                    last_name NVARCHAR(255) NOT NULL,
                    email NVARCHAR(255) NOT NULL,
                    hashed_password NVARCHAR(255) NOT NULL,
                    phone NVARCHAR(50) NULL,
                    role NVARCHAR(100) NOT NULL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    is_deleted BIT NOT NULL CONSTRAINT DF_tbl_users__tmp_identity_is_deleted DEFAULT ((0)),
                    is_active BIT NOT NULL CONSTRAINT DF_tbl_users__tmp_identity_is_active DEFAULT ((1)),
                    CONSTRAINT PK_tbl_users__tmp_identity PRIMARY KEY (id)
                );

                SET IDENTITY_INSERT dbo.tbl_users__tmp_identity ON;
                INSERT INTO dbo.tbl_users__tmp_identity (
                    id,
                    first_name,
                    last_name,
                    email,
                    hashed_password,
                    phone,
                    role,
                    created_at,
                    updated_at,
                    is_deleted,
                    is_active
                )
                SELECT
                    id,
                    first_name,
                    last_name,
                    email,
                    hashed_password,
                    phone,
                    role,
                    created_at,
                    updated_at,
                    is_deleted,
                    is_active
                FROM dbo.tbl_users;
                SET IDENTITY_INSERT dbo.tbl_users__tmp_identity OFF;

                DROP TABLE dbo.tbl_users;
                EXEC sp_rename 'dbo.tbl_users__tmp_identity', 'tbl_users';
            END

            IF OBJECT_ID(N'dbo.tbl_fund_deposits', N'U') IS NOT NULL
               AND COLUMNPROPERTY(OBJECT_ID(N'dbo.tbl_fund_deposits'), 'id', 'IsIdentity') = 0
            BEGIN
                CREATE TABLE dbo.tbl_fund_deposits__tmp_identity (
                    id BIGINT IDENTITY(1,1) NOT NULL,
                    fund_account NVARCHAR(MAX) NOT NULL,
                    budgeted_fund FLOAT NOT NULL,
                    deposited_fund FLOAT NOT NULL,
                    date_of_deposit DATETIME NOT NULL,
                    mode_of_transfer NVARCHAR(255) NOT NULL,
                    remarks NVARCHAR(MAX) NULL,
                    added_by BIGINT NULL,
                    CONSTRAINT PK_tbl_fund_deposits__tmp_identity PRIMARY KEY (id)
                );

                SET IDENTITY_INSERT dbo.tbl_fund_deposits__tmp_identity ON;
                INSERT INTO dbo.tbl_fund_deposits__tmp_identity (
                    id,
                    fund_account,
                    budgeted_fund,
                    deposited_fund,
                    date_of_deposit,
                    mode_of_transfer,
                    remarks,
                    added_by
                )
                SELECT
                    id,
                    fund_account,
                    budgeted_fund,
                    deposited_fund,
                    date_of_deposit,
                    mode_of_transfer,
                    remarks,
                    added_by
                FROM dbo.tbl_fund_deposits;
                SET IDENTITY_INSERT dbo.tbl_fund_deposits__tmp_identity OFF;

                DROP TABLE dbo.tbl_fund_deposits;
                EXEC sp_rename 'dbo.tbl_fund_deposits__tmp_identity', 'tbl_fund_deposits';
            END

            IF OBJECT_ID(N'dbo.tbl_expenses', N'U') IS NOT NULL
               AND COLUMNPROPERTY(OBJECT_ID(N'dbo.tbl_expenses'), 'id', 'IsIdentity') = 0
            BEGIN
                CREATE TABLE dbo.tbl_expenses__tmp_identity (
                    id BIGINT IDENTITY(1,1) NOT NULL,
                    fund_account_id BIGINT NOT NULL,
                    date_of_expense DATETIME NOT NULL,
                    purpose NVARCHAR(MAX) NOT NULL,
                    withdrawn_amount FLOAT NOT NULL,
                    returned_amount FLOAT NOT NULL CONSTRAINT DF_tbl_expenses__tmp_identity_returned_amount DEFAULT ((0.0)),
                    running_balance FLOAT NOT NULL,
                    category_tage NVARCHAR(MAX) NOT NULL,
                    payment_by NVARCHAR(MAX) NOT NULL,
                    created_by BIGINT NULL,
                    updated_by BIGINT NULL,
                    updated_at DATETIME NOT NULL,
                    CONSTRAINT PK_tbl_expenses__tmp_identity PRIMARY KEY (id)
                );

                SET IDENTITY_INSERT dbo.tbl_expenses__tmp_identity ON;
                INSERT INTO dbo.tbl_expenses__tmp_identity (
                    id,
                    fund_account_id,
                    date_of_expense,
                    purpose,
                    withdrawn_amount,
                    returned_amount,
                    running_balance,
                    category_tage,
                    payment_by,
                    created_by,
                    updated_by,
                    updated_at
                )
                SELECT
                    id,
                    fund_account_id,
                    date_of_expense,
                    purpose,
                    withdrawn_amount,
                    returned_amount,
                    running_balance,
                    category_tage,
                    payment_by,
                    created_by,
                    updated_by,
                    updated_at
                FROM dbo.tbl_expenses;
                SET IDENTITY_INSERT dbo.tbl_expenses__tmp_identity OFF;

                DROP TABLE dbo.tbl_expenses;
                EXEC sp_rename 'dbo.tbl_expenses__tmp_identity', 'tbl_expenses';
            END

            IF OBJECT_ID(N'dbo.tbl_expenses_bills', N'U') IS NOT NULL
               AND COLUMNPROPERTY(OBJECT_ID(N'dbo.tbl_expenses_bills'), 'id', 'IsIdentity') = 0
            BEGIN
                CREATE TABLE dbo.tbl_expenses_bills__tmp_identity (
                    id BIGINT IDENTITY(1,1) NOT NULL,
                    expense_id BIGINT NOT NULL,
                    bill_url NVARCHAR(MAX) NOT NULL,
                    CONSTRAINT PK_tbl_expenses_bills__tmp_identity PRIMARY KEY (id)
                );

                SET IDENTITY_INSERT dbo.tbl_expenses_bills__tmp_identity ON;
                INSERT INTO dbo.tbl_expenses_bills__tmp_identity (
                    id,
                    expense_id,
                    bill_url
                )
                SELECT
                    id,
                    expense_id,
                    bill_url
                FROM dbo.tbl_expenses_bills;
                SET IDENTITY_INSERT dbo.tbl_expenses_bills__tmp_identity OFF;

                DROP TABLE dbo.tbl_expenses_bills;
                EXEC sp_rename 'dbo.tbl_expenses_bills__tmp_identity', 'tbl_expenses_bills';
            END
            """
        )
    )


def _recreate_foreign_keys() -> None:
    op.execute(
        sa.text(
            """
            IF COL_LENGTH('dbo.tbl_fund_deposits', 'added_by') IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1
                   FROM sys.foreign_keys
                   WHERE name = 'fk_tbl_fund_deposits_added_by_tbl_users_id'
               )
            BEGIN
                ALTER TABLE dbo.tbl_fund_deposits
                ADD CONSTRAINT fk_tbl_fund_deposits_added_by_tbl_users_id
                FOREIGN KEY (added_by) REFERENCES dbo.tbl_users(id)
                ON DELETE SET NULL
                ON UPDATE NO ACTION;
            END

            IF COL_LENGTH('dbo.tbl_expenses', 'fund_account_id') IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1
                   FROM sys.foreign_keys
                   WHERE name = 'fk_tbl_expenses_fund_account_id_tbl_fund_deposits_id'
               )
            BEGIN
                ALTER TABLE dbo.tbl_expenses
                ADD CONSTRAINT fk_tbl_expenses_fund_account_id_tbl_fund_deposits_id
                FOREIGN KEY (fund_account_id) REFERENCES dbo.tbl_fund_deposits(id)
                ON UPDATE CASCADE;
            END

            IF COL_LENGTH('dbo.tbl_expenses', 'created_by') IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1
                   FROM sys.foreign_keys
                   WHERE name = 'fk_tbl_expenses_created_by_tbl_users_id'
               )
            BEGIN
                ALTER TABLE dbo.tbl_expenses
                ADD CONSTRAINT fk_tbl_expenses_created_by_tbl_users_id
                FOREIGN KEY (created_by) REFERENCES dbo.tbl_users(id);
            END

            IF COL_LENGTH('dbo.tbl_expenses', 'updated_by') IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1
                   FROM sys.foreign_keys
                   WHERE name = 'fk_tbl_expenses_updated_by_tbl_users_id'
               )
            BEGIN
                ALTER TABLE dbo.tbl_expenses
                ADD CONSTRAINT fk_tbl_expenses_updated_by_tbl_users_id
                FOREIGN KEY (updated_by) REFERENCES dbo.tbl_users(id);
            END

            IF COL_LENGTH('dbo.tbl_expenses_bills', 'expense_id') IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1
                   FROM sys.foreign_keys
                   WHERE name = 'fk_tbl_expenses_bills_expense_id_tbl_expenses_id'
               )
            BEGIN
                ALTER TABLE dbo.tbl_expenses_bills
                ADD CONSTRAINT fk_tbl_expenses_bills_expense_id_tbl_expenses_id
                FOREIGN KEY (expense_id) REFERENCES dbo.tbl_expenses(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE;
            END
            """
        )
    )


def _ensure_non_identity_ids() -> None:
    op.execute(
        sa.text(
            """
            IF OBJECT_ID(N'dbo.tbl_expenses_bills', N'U') IS NOT NULL
               AND COLUMNPROPERTY(OBJECT_ID(N'dbo.tbl_expenses_bills'), 'id', 'IsIdentity') = 1
            BEGIN
                CREATE TABLE dbo.tbl_expenses_bills__tmp_no_identity (
                    id BIGINT NOT NULL,
                    expense_id BIGINT NOT NULL,
                    bill_url NVARCHAR(MAX) NOT NULL,
                    CONSTRAINT PK_tbl_expenses_bills__tmp_no_identity PRIMARY KEY (id)
                );

                INSERT INTO dbo.tbl_expenses_bills__tmp_no_identity (id, expense_id, bill_url)
                SELECT id, expense_id, bill_url FROM dbo.tbl_expenses_bills;

                DROP TABLE dbo.tbl_expenses_bills;
                EXEC sp_rename 'dbo.tbl_expenses_bills__tmp_no_identity', 'tbl_expenses_bills';
            END

            IF OBJECT_ID(N'dbo.tbl_expenses', N'U') IS NOT NULL
               AND COLUMNPROPERTY(OBJECT_ID(N'dbo.tbl_expenses'), 'id', 'IsIdentity') = 1
            BEGIN
                CREATE TABLE dbo.tbl_expenses__tmp_no_identity (
                    id BIGINT NOT NULL,
                    fund_account_id BIGINT NOT NULL,
                    date_of_expense DATETIME NOT NULL,
                    purpose NVARCHAR(MAX) NOT NULL,
                    withdrawn_amount FLOAT NOT NULL,
                    returned_amount FLOAT NOT NULL CONSTRAINT DF_tbl_expenses__tmp_no_identity_returned_amount DEFAULT ((0.0)),
                    running_balance FLOAT NOT NULL,
                    category_tage NVARCHAR(MAX) NOT NULL,
                    payment_by NVARCHAR(MAX) NOT NULL,
                    created_by BIGINT NULL,
                    updated_by BIGINT NULL,
                    updated_at DATETIME NOT NULL,
                    CONSTRAINT PK_tbl_expenses__tmp_no_identity PRIMARY KEY (id)
                );

                INSERT INTO dbo.tbl_expenses__tmp_no_identity (
                    id,
                    fund_account_id,
                    date_of_expense,
                    purpose,
                    withdrawn_amount,
                    returned_amount,
                    running_balance,
                    category_tage,
                    payment_by,
                    created_by,
                    updated_by,
                    updated_at
                )
                SELECT
                    id,
                    fund_account_id,
                    date_of_expense,
                    purpose,
                    withdrawn_amount,
                    returned_amount,
                    running_balance,
                    category_tage,
                    payment_by,
                    created_by,
                    updated_by,
                    updated_at
                FROM dbo.tbl_expenses;

                DROP TABLE dbo.tbl_expenses;
                EXEC sp_rename 'dbo.tbl_expenses__tmp_no_identity', 'tbl_expenses';
            END

            IF OBJECT_ID(N'dbo.tbl_fund_deposits', N'U') IS NOT NULL
               AND COLUMNPROPERTY(OBJECT_ID(N'dbo.tbl_fund_deposits'), 'id', 'IsIdentity') = 1
            BEGIN
                CREATE TABLE dbo.tbl_fund_deposits__tmp_no_identity (
                    id BIGINT NOT NULL,
                    fund_account NVARCHAR(MAX) NOT NULL,
                    budgeted_fund FLOAT NOT NULL,
                    deposited_fund FLOAT NOT NULL,
                    date_of_deposit DATETIME NOT NULL,
                    mode_of_transfer NVARCHAR(255) NOT NULL,
                    remarks NVARCHAR(MAX) NULL,
                    added_by BIGINT NULL,
                    CONSTRAINT PK_tbl_fund_deposits__tmp_no_identity PRIMARY KEY (id)
                );

                INSERT INTO dbo.tbl_fund_deposits__tmp_no_identity (
                    id,
                    fund_account,
                    budgeted_fund,
                    deposited_fund,
                    date_of_deposit,
                    mode_of_transfer,
                    remarks,
                    added_by
                )
                SELECT
                    id,
                    fund_account,
                    budgeted_fund,
                    deposited_fund,
                    date_of_deposit,
                    mode_of_transfer,
                    remarks,
                    added_by
                FROM dbo.tbl_fund_deposits;

                DROP TABLE dbo.tbl_fund_deposits;
                EXEC sp_rename 'dbo.tbl_fund_deposits__tmp_no_identity', 'tbl_fund_deposits';
            END

            IF OBJECT_ID(N'dbo.tbl_users', N'U') IS NOT NULL
               AND COLUMNPROPERTY(OBJECT_ID(N'dbo.tbl_users'), 'id', 'IsIdentity') = 1
            BEGIN
                CREATE TABLE dbo.tbl_users__tmp_no_identity (
                    id BIGINT NOT NULL,
                    first_name NVARCHAR(255) NOT NULL,
                    last_name NVARCHAR(255) NOT NULL,
                    email NVARCHAR(255) NOT NULL,
                    hashed_password NVARCHAR(255) NOT NULL,
                    phone NVARCHAR(50) NULL,
                    role NVARCHAR(100) NOT NULL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    is_deleted BIT NOT NULL CONSTRAINT DF_tbl_users__tmp_no_identity_is_deleted DEFAULT ((0)),
                    is_active BIT NOT NULL CONSTRAINT DF_tbl_users__tmp_no_identity_is_active DEFAULT ((1)),
                    CONSTRAINT PK_tbl_users__tmp_no_identity PRIMARY KEY (id)
                );

                INSERT INTO dbo.tbl_users__tmp_no_identity (
                    id,
                    first_name,
                    last_name,
                    email,
                    hashed_password,
                    phone,
                    role,
                    created_at,
                    updated_at,
                    is_deleted,
                    is_active
                )
                SELECT
                    id,
                    first_name,
                    last_name,
                    email,
                    hashed_password,
                    phone,
                    role,
                    created_at,
                    updated_at,
                    is_deleted,
                    is_active
                FROM dbo.tbl_users;

                DROP TABLE dbo.tbl_users;
                EXEC sp_rename 'dbo.tbl_users__tmp_no_identity', 'tbl_users';
            END
            """
        )
    )


def upgrade() -> None:
    needs_identity_rebuild = _has_non_identity_ids()

    if needs_identity_rebuild:
        _drop_related_foreign_keys()
        _ensure_identity_ids()

    op.create_table(
        "tbl_fund_deposits_history",
        sa.Column("id", mssql.BIGINT(), sa.Identity(start=1, increment=1), primary_key=True, nullable=False),
        sa.Column("fund_account_id", mssql.BIGINT(), nullable=False),
        sa.Column("transaction_date", mssql.DATETIME(), nullable=False),
        sa.Column("credit", sa.Float(precision=53), nullable=False),
        sa.Column("debit", sa.Float(precision=53), nullable=False),
        sa.Column("running_balance", sa.Float(precision=53), nullable=False),
        sa.Column("reference", mssql.NVARCHAR(length=None), nullable=True),
        sa.Column("bill_file", mssql.NVARCHAR(length=None), nullable=True),
        sa.Column("added_by", mssql.BIGINT(), nullable=True),
        sa.ForeignKeyConstraint(
            ["fund_account_id"],
            ["tbl_fund_deposits.id"],
            name="fk_tbl_fund_deposits_history_fund_account_id_tbl_fund_deposits_id",
            onupdate="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["added_by"],
            ["tbl_users.id"],
            name="fk_tbl_fund_deposits_history_added_by_tbl_users_id",
            ondelete="NO ACTION",
            onupdate="NO ACTION",
        ),
    )

    if needs_identity_rebuild:
        _recreate_foreign_keys()


def downgrade() -> None:
    op.drop_table("tbl_fund_deposits_history")

    _drop_related_foreign_keys()
    _ensure_non_identity_ids()
    _recreate_foreign_keys()
