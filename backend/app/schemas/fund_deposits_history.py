"""Pydantic schemas for tbl_fund_deposits_history."""
from datetime import datetime

from pydantic import BaseModel, Field


class FundDepositsHistoryBase(BaseModel):
    """Shared tbl_fund_deposits_history fields."""

    fund_account_id: int
    opening_balance: float = 0.0
    transaction_date: datetime
    credit: float
    debit: float
    running_balance: float
    reference: str | None = None
    bill_files: list[str] = Field(default_factory=list)
    added_by: str | None = None


class FundDepositsHistoryCreate(FundDepositsHistoryBase):
    """Create payload for tbl_fund_deposits_history."""


class FundDepositsHistoryResponse(BaseModel):
    """Response schema for tbl_fund_deposits_history."""

    id: int
    fund_account_id: int
    opening_balance: float = 0.0
    transaction_date: datetime
    credit: float
    debit: float
    running_balance: float
    reference: str | None = None
    bill_files: list[str] = Field(default_factory=list)
    added_by: str | None = None

    class Config:
        from_attributes = True
