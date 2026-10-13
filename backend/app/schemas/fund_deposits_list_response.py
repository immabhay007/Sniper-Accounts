from typing import List
from pydantic import BaseModel
from .fund_deposits import FundDepositResponse

class FundDepositSummary(BaseModel):
    total_deposited: float
    total_spent: float
    net_balance: float

class FundDepositListResponse(BaseModel):
    data: List[FundDepositResponse]
    summary: FundDepositSummary
