"""Dashboard endpoints."""
from datetime import datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.models.models import Expense, FundDeposit
from app.models import FundDepositHistory

from app.schemas.dashboard import (
    DashboardFundAmountResponse,
    DashboardResponse,
    DashboardSummaryResponse,
)

router = APIRouter()


def _parse_range_boundary(value: str, *, end_of_day: bool) -> datetime:
    """Parse ISO date/datetime into inclusive datetime boundary."""
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid date format. Use ISO date or datetime."
        ) from exc

    if parsed.tzinfo is not None:
        parsed = parsed.replace(tzinfo=None)

    if "T" not in value and " " not in value:
        return datetime.combine(
            parsed.date(),
            time.max if end_of_day else time.min
        )

    return parsed


def _resolve_status(balance_remaining: float, deposited_amount: float) -> str:
    """Return dashboard health status."""
    if balance_remaining < 0:
        return "overspent"

    if deposited_amount <= 0:
        return "low"

    if balance_remaining <= deposited_amount * 0.2:
        return "low"

    return "healthy"


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    from_date: str = Query(...),
    to_date: str = Query(...),
    user_id: int = Query(..., description="Pass 0 to skip user filter"),
    db: Session = Depends(get_db),
):
    """Return dashboard summary using fund deposits, expenses and history."""

    start_at = _parse_range_boundary(from_date, end_of_day=False)
    end_at = _parse_range_boundary(to_date, end_of_day=True)

    if start_at > end_at:
        raise HTTPException(
            status_code=400,
            detail="from_date must be <= to_date"
        )

    # ---------------------------------------------------------
    # OPENING BALANCE (BEFORE SELECTED RANGE)
    # ---------------------------------------------------------

    opening_deposit_query = db.query(FundDeposit).filter(
        FundDeposit.date_of_deposit < start_at,
    )

    if user_id != 0:
        opening_deposit_query = opening_deposit_query.filter(
            FundDeposit.added_by == user_id
        )

    opening_deposits = opening_deposit_query.all()

    opening_expense_query = (
        db.query(
            Expense,
            FundDeposit.fund_account,
            FundDeposit.added_by,
        )
        .join(
            FundDeposit,
            Expense.fund_account_id == FundDeposit.id,
        )
        .filter(
            Expense.date_of_expense < start_at,
        )
    )

    if user_id != 0:
        opening_expense_query = opening_expense_query.filter(
            FundDeposit.added_by == user_id
        )

    opening_expense_rows = opening_expense_query.all()

    opening_balance = float(
        sum(
            float(deposit.deposited_fund or 0.0)
            + float(deposit.opening_balance or 0.0)
            for deposit in opening_deposits
        )
        - sum(
            float(expense.withdrawn_amount or 0.0)
            - float(expense.returned_amount or 0.0)
            for expense, _, _ in opening_expense_rows
        )
    )

    # ---------------------------------------------------------
    # FUND DEPOSITS
    # ---------------------------------------------------------

    deposit_query = db.query(FundDeposit).filter(
        FundDeposit.date_of_deposit >= start_at,
        FundDeposit.date_of_deposit <= end_at,
    )

    if user_id != 0:
        deposit_query = deposit_query.filter(
            FundDeposit.added_by == user_id
        )

    deposits = deposit_query.all()

    # ---------------------------------------------------------
    # EXPENSES
    # ---------------------------------------------------------

    expense_query = (
        db.query(
            Expense,
            FundDeposit.fund_account,
            FundDeposit.added_by,
        )
        .join(
            FundDeposit,
            Expense.fund_account_id == FundDeposit.id,
        )
        .filter(
            Expense.date_of_expense >= start_at,
            Expense.date_of_expense <= end_at,
        )
    )

    if user_id != 0:
        expense_query = expense_query.filter(
            FundDeposit.added_by == user_id
        )

    expense_rows = expense_query.all()

    # ---------------------------------------------------------
    # TOTAL DEPOSITED
    # Use only deposit table
    # ---------------------------------------------------------

    total_deposited = float(
        sum(
            float(deposit.deposited_fund or 0.0)
            + float(deposit.opening_balance or 0.0)
            for deposit in deposits
        )
    )

    # ---------------------------------------------------------
    # TOTAL SPENT
    # Use actual spent amount
    # withdrawn - returned
    # ---------------------------------------------------------

    total_spent = float(
        sum(
            float(expense.withdrawn_amount or 0.0)
            - float(expense.returned_amount or 0.0)
            for expense, _, _ in expense_rows
        )
    )

    # ---------------------------------------------------------
    # NET BALANCE
    # ---------------------------------------------------------

    net_balance = opening_balance + total_deposited - total_spent

    # ---------------------------------------------------------
    # FUND WISE DATA
    # ---------------------------------------------------------

    fund_map: dict[str, dict[str, float]] = {}

    # Build opening balance bucket per fund before selected range.
    for deposit in opening_deposits:
        bucket = fund_map.setdefault(
            deposit.fund_account,
            {
                "budgeted_amount": 0.0,
                "opening_balance": 0.0,
                "deposited_amount": 0.0,
                "total_spent": 0.0,
                "balance_remaining": 0.0,
                "fund_account_id": deposit.id,
            },
        )

        bucket["opening_balance"] += (
            float(deposit.deposited_fund or 0.0)
            + float(deposit.opening_balance or 0.0)
        )

    for expense, fund_account, _ in opening_expense_rows:
        bucket = fund_map.setdefault(
            fund_account,
            {
                "budgeted_amount": 0.0,
                "opening_balance": 0.0,
                "deposited_amount": 0.0,
                "total_spent": 0.0,
                "balance_remaining": 0.0,
                "fund_account_id": expense.fund_account_id,
            },
        )

        bucket["opening_balance"] -= (
            float(expense.withdrawn_amount or 0.0)
            - float(expense.returned_amount or 0.0)
        )

    # Add deposit data
    for deposit in deposits:
        bucket = fund_map.setdefault(
            deposit.fund_account,
            {
                "budgeted_amount": 0.0,
                "opening_balance": 0.0,
                "deposited_amount": 0.0,
                "total_spent": 0.0,
                "balance_remaining": 0.0,
                "fund_account_id": deposit.id,
            },
        )

        bucket["budgeted_amount"] += float(
            deposit.budgeted_fund or 0.0
        )

        bucket["deposited_amount"] += (
            float(deposit.deposited_fund or 0.0)
            + float(deposit.opening_balance or 0.0)
        )

    # Add expense data
    for expense, fund_account, _ in expense_rows:
        bucket = fund_map.setdefault(
            fund_account,
            {
                "budgeted_amount": 0.0,
                "opening_balance": 0.0,
                "deposited_amount": 0.0,
                "total_spent": 0.0,
                "balance_remaining": 0.0,
                "fund_account_id": expense.fund_account_id,
            },
        )

        bucket["total_spent"] += (
            float(expense.withdrawn_amount or 0.0)
            - float(expense.returned_amount or 0.0)
        )

    # ---------------------------------------------------------
    # FINAL RESPONSE
    # ---------------------------------------------------------

    fund_amount_wise = []

    for fund_account, totals in sorted(fund_map.items()):

        fund_account_id = totals["fund_account_id"]

        # Get latest running balance from history table
        latest_history = (
            db.query(FundDepositHistory)
            .filter(
                FundDepositHistory.fund_account_id == fund_account_id,
                FundDepositHistory.transaction_date <= end_at,
            )
            .order_by(FundDepositHistory.id.desc())
            .first()
        )

        # Prefer history running balance
        if latest_history:
            balance_remaining = float(
                latest_history.running_balance or 0.0
            )
        else:
            balance_remaining = (
                totals["opening_balance"]
                + totals["deposited_amount"]
                - totals["total_spent"]
            )

        deposited_amount = totals["deposited_amount"]
        total_spent_amount = totals["total_spent"]

        fund_amount_wise.append(
            DashboardFundAmountResponse(
                fund_amount=fund_account,
                budgeted_amount=totals["budgeted_amount"],
                deposited_amount=deposited_amount,
                total_spent=total_spent_amount,
                balance_remaining=balance_remaining,
                status=_resolve_status(
                    balance_remaining,
                    deposited_amount,
                ),
            )
        )

    return DashboardResponse(
        summary=DashboardSummaryResponse(
            total_deposited=total_deposited,
            total_spent=total_spent,
            net_balance=net_balance,
        ),
        fund_amount_wise=fund_amount_wise,
    )