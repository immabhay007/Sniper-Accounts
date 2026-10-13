"""Pydantic schemas for tbl_fund_deposits."""
from datetime import datetime

from pydantic import BaseModel


class FundDepositBase(BaseModel):
    """Shared tbl_fund_deposits fields."""

    fund_account: str
    budgeted_fund: float
    opening_balance: float = 0.0
    deposited_fund: float
    date_of_deposit: datetime
    mode_of_transfer: str
    remarks: str | None = None
    added_by: int | str | None = None


class FundDepositCreate(FundDepositBase):
    """Create payload for tbl_fund_deposits."""


class FundDepositUpdate(BaseModel):
    """Update payload for tbl_fund_deposits."""

    fund_account: str | None = None
    budgeted_fund: float | None = None
    opening_balance: float | None = None
    deposited_fund: float | None = None
    date_of_deposit: datetime | None = None
    mode_of_transfer: str | None = None
    remarks: str | None = None
    added_by: int | str | None = None
    timezone: str | None = "UTC"


class FundDepositAddAmountUpdate(BaseModel):
    """Payload to add amount into deposited_fund and update audit fields."""

    deposited_fund: float
    date_of_deposit: datetime
    mode_of_transfer: str
    added_by: int | str | None = None



class FundDepositResponse(FundDepositBase):
    """Response schema for tbl_fund_deposits."""

    id: int
    total_spent: float
    running_balance: float

    class Config:
        from_attributes = True


class FundDepositAccountResponse(BaseModel):
    """Lightweight fund deposit response with account identity fields only."""

    id: int
    fund_account: str

    class Config:
        from_attributes = True
