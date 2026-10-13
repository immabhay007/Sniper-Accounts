"""Pydantic schemas for tbl_expenses."""
from datetime import datetime

from pydantic import BaseModel

from app.schemas.expense_bills import ExpenseBillResponse


class ExpenseBase(BaseModel):
    """Shared tbl_expenses fields."""

    fund_account_id: int
    date_of_expense: datetime
    purpose: str
    withdrawn_amount: float
    returned_amount: float = 0.0
    running_balance: float
    category_tage: str
    payment_by: str
    created_by: int | None = None
    updated_by: int | None = None
    updated_at: datetime | None = None


class ExpenseCreate(ExpenseBase):
    """Create payload for tbl_expenses."""


class ExpenseUpdate(BaseModel):
    """Update payload for tbl_expenses."""

    fund_account_id: int | None = None
    date_of_expense: datetime | None = None
    purpose: str | None = None
    withdrawn_amount: float | None = None
    returned_amount: float | None = None
    running_balance: float | None = None
    category_tage: str | None = None
    payment_by: str | None = None
    created_by: int | None = None
    updated_by: int | None = None
    updated_at: datetime | None = None


class ExpenseResponse(ExpenseBase):
    """Response schema for tbl_expenses."""

    id: int
    fund_account: str | None = None
    created_by_name: str | None = None
    updated_by_name: str | None = None
    bills: list[ExpenseBillResponse] = []

    class Config:
        from_attributes = True


class ExpenseSummary(BaseModel):
    latest_running_balance: float


class ExpenseListResponse(BaseModel):
    data: list[ExpenseResponse]
    summary: ExpenseSummary