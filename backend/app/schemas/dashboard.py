"""Pydantic schemas for dashboard responses."""
from pydantic import BaseModel


class DashboardSummaryResponse(BaseModel):
    """Top-level dashboard summary totals."""

    total_deposited: float
    total_spent: float
    net_balance: float


class DashboardFundAmountResponse(BaseModel):
    """Fund-account-wise dashboard totals."""

    fund_amount: str
    budgeted_amount: float
    deposited_amount: float
    total_spent: float
    balance_remaining: float
    status: str


class DashboardResponse(BaseModel):
    """Dashboard response payload."""

    summary: DashboardSummaryResponse
    fund_amount_wise: list[DashboardFundAmountResponse]