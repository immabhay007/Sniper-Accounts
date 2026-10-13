"""Helpers for writing tbl_fund_deposits_history ledger rows."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import FundDeposit, FundDepositHistory, User


def _resolve_added_by_name(db: Session, added_by: int | str | None) -> str | None:
    """Resolve added_by as full name when user_id is provided, else keep string value."""
    if added_by is None:
        return None

    if isinstance(added_by, str):
        raw = added_by.strip()
        if not raw:
            return None
        if not raw.isdigit():
            return raw
        user_id = int(raw)
    elif isinstance(added_by, int):
        user_id = added_by
    else:
        return str(added_by)

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return str(user_id)

    full_name = f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip()
    return full_name or str(user_id)


def add_fund_deposit_history(
    db: Session,
    *,
    fund_account_id: int,
    transaction_date: datetime,
    credit: float,
    debit: float,
    reference: str | None = None,
    bill_file: str | None = None,
    added_by: int | str | None = None,
) -> FundDepositHistory:
    """Insert a ledger row with running balance based on base balance and cumulative transactions."""
    fund_deposit = db.query(FundDeposit).filter(FundDeposit.id == fund_account_id).first()
    opening_balance = float(fund_deposit.opening_balance or 0.0) if fund_deposit else 0.0
    base_balance = opening_balance

    history_totals = (
        db.query(
            func.coalesce(func.sum(FundDepositHistory.credit), 0.0),
            func.coalesce(func.sum(FundDepositHistory.debit), 0.0),
        )
        .filter(FundDepositHistory.fund_account_id == fund_account_id)
        .first()
    )
    previous_credits = float(history_totals[0] or 0.0) if history_totals else 0.0
    previous_debits = float(history_totals[1] or 0.0) if history_totals else 0.0
    resolved_credit = float(credit or 0.0)
    resolved_debit = float(debit or 0.0)
    running_balance = base_balance + previous_credits + resolved_credit - previous_debits - resolved_debit

    row = FundDepositHistory(
        fund_account_id=fund_account_id,
        transaction_date=transaction_date,
        credit=resolved_credit,
        debit=resolved_debit,
        running_balance=running_balance,
        reference=reference,
        bill_file=bill_file,
        added_by=_resolve_added_by_name(db, added_by),
    )
    db.add(row)
    return row
