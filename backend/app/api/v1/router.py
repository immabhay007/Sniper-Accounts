"""API v1 router."""
from fastapi import APIRouter, Depends

from app.api.v1.endpoints import auth, dashboard, expense_bills, expenses, fund_deposits, user
from app.core.deps import get_current_user

router = APIRouter()

# Include auth endpoints
router.include_router(auth.router, prefix="/auth", tags=["auth"])
from app.api.v1.endpoints.user import public_router
router.include_router(
	public_router,
	prefix="/users",
	tags=["users"],
)
router.include_router(
	user.router,
	prefix="/users",
	tags=["users"],
	dependencies=[Depends(get_current_user)],
)
router.include_router(
	fund_deposits.router,
	prefix="/fund-deposits",
	tags=["fund-deposits"],
	dependencies=[Depends(get_current_user)],
)
router.include_router(
	expenses.router,
	prefix="/expenses",
	tags=["expenses"],
	dependencies=[Depends(get_current_user)],
)
router.include_router(
	expense_bills.router,
	prefix="/expense-bills",
	tags=["expense-bills"],
	dependencies=[Depends(get_current_user)],
)
router.include_router(
	dashboard.router,
	prefix="/dashboard",
	tags=["dashboard"],
	dependencies=[Depends(get_current_user)],
)


router.include_router(
    user.router,
    prefix="/register-user",
    tags=["users"],
)