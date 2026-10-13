"""Expense bills endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Expense, ExpenseBill
from app.schemas.expense_bills import ExpenseBillCreate, ExpenseBillResponse, ExpenseBillUpdate

router = APIRouter()


@router.get("", response_model=list[ExpenseBillResponse])
async def get_expense_bills(
    expense_id: int,
    db: Session = Depends(get_db),
):
    """Get all bills for a given expense_id."""
    return db.query(ExpenseBill).filter(ExpenseBill.expense_id == expense_id).all()


@router.post("", response_model=ExpenseBillResponse, status_code=status.HTTP_201_CREATED)
async def create_expense_bill(
    payload: ExpenseBillCreate,
    db: Session = Depends(get_db),
):
    """Attach a bill URL to an expense."""
    expense = db.query(Expense).filter(Expense.id == payload.expense_id).first()
    if expense is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    item = ExpenseBill(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{id}", response_model=ExpenseBillResponse)
async def update_expense_bill(
    id: int,
    payload: ExpenseBillUpdate,
    db: Session = Depends(get_db),
):
    """Update a bill URL by id."""
    item = db.query(ExpenseBill).filter(ExpenseBill.id == id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense bill not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/{id}", status_code=status.HTTP_200_OK)
async def delete_expense_bill(
    id: int,
    db: Session = Depends(get_db),
):
    """Delete a bill by id."""
    item = db.query(ExpenseBill).filter(ExpenseBill.id == id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense bill not found")

    db.delete(item)
    db.commit()
    return {"message": "Expense bill deleted successfully"}
