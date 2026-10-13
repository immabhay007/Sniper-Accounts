"""Pydantic schemas for tbl_expenses_bills."""
from pydantic import BaseModel


class ExpenseBillBase(BaseModel):
    """Shared tbl_expenses_bills fields."""

    expense_id: int
    bill_url: str


class ExpenseBillCreate(ExpenseBillBase):
    """Create payload for tbl_expenses_bills."""


class ExpenseBillUpdate(BaseModel):
    """Update payload for tbl_expenses_bills."""

    bill_url: str | None = None


class ExpenseBillResponse(ExpenseBillBase):
    """Response schema for tbl_expenses_bills."""

    id: int

    class Config:
        from_attributes = True
