"""Expense endpoints."""
import base64
from datetime import datetime, time
import json
import logging
import mimetypes
from typing import List, Optional
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, literal, literal_column
from sqlalchemy.orm import Session, aliased, selectinload

from app.db.session import get_db
from app.core.datetime_utils import convert_to_utc
from app.models.models import Expense, ExpenseBill, FundDeposit, FundDepositHistory, User
from app.schemas.expenses import ExpenseListResponse, ExpenseResponse
from app.services.azure_blob_storage import upload_bill_file
from app.services.fund_deposits_history import add_fund_deposit_history


logger = logging.getLogger(__name__)
router = APIRouter()


def _bill_url_to_data_uri(url: str) -> str:
    """Fetch a blob URL and convert it to a base64 data URI."""
    if url.startswith("data:"):
        return url

    request = Request(url, headers={"User-Agent": "sniper-backend/1.0"})
    with urlopen(request, timeout=20) as response:  # nosec B310 - trusted URL from DB
        payload = response.read()
        content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()

    if not content_type:
        guessed_type, _ = mimetypes.guess_type(urlsplit(url).path)
        content_type = guessed_type or "application/octet-stream"

    encoded = base64.b64encode(payload).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def _parse_range_boundary(value: str, *, end_of_day: bool) -> datetime:
    """Parse an ISO date or datetime string into an inclusive datetime boundary."""
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO date or datetime.") from exc

    if parsed.tzinfo is not None:
        parsed = parsed.replace(tzinfo=None)

    if "T" not in value and " " not in value:
        return datetime.combine(parsed.date(), time.max if end_of_day else time.min)

    return parsed


def _full_name_expr(alias_name: str):
    """Build a SQL expression for first_name + last_name on a joined user alias."""
    return func.ltrim(
        func.rtrim(
            func.concat(
                func.coalesce(literal_column(f"{alias_name}.first_name"), ""),
                literal(" "),
                func.coalesce(literal_column(f"{alias_name}.last_name"), ""),
            )
        )
    )


def _expense_query(db: Session):
    """Build the base expense query with related fund account and creator/updater names."""
    created_user = aliased(User, name="created_user")
    updated_user = aliased(User, name="updated_user")

    return (
        db.query(
            Expense,
            FundDeposit.fund_account.label("fund_account"),
            _full_name_expr("created_user").label("created_by_name"),
            _full_name_expr("updated_user").label("updated_by_name"),
        )
        .options(selectinload(Expense.bills))
        .join(FundDeposit, Expense.fund_account_id == FundDeposit.id)
        .outerjoin(created_user, Expense.created_by == created_user.id)
        .outerjoin(updated_user, Expense.updated_by == updated_user.id)
    )


def _serialize_expense(
    expense: Expense,
    fund_account: str | None = None,
    created_by_name: str | None = None,
    updated_by_name: str | None = None,
    encode_bill_data: bool = False,
) -> ExpenseResponse:
    """Map an ORM expense row and related joined values into the response schema."""
    bills = []
    if expense.bills:
        for bill in expense.bills:
            bill_value = bill.bill_url
            if encode_bill_data and bill.bill_url:
                try:
                    bill_value = _bill_url_to_data_uri(bill.bill_url)
                except Exception as exc:
                    logger.error(f"Failed to convert bill URL to base64 for bill_id={bill.id}: {str(exc)}")
                    # Do not fail entire expenses response for one bad bill URL.
                    # Fallback to stored value so frontend can still render other records.
                    bill_value = bill.bill_url

            bills.append(
                {"id": bill.id, "expense_id": bill.expense_id, "bill_url": bill_value}
            )
    return ExpenseResponse(
        id=expense.id,
        fund_account_id=expense.fund_account_id,
        date_of_expense=expense.date_of_expense,
        purpose=expense.purpose,
        withdrawn_amount=expense.withdrawn_amount,
        returned_amount=expense.returned_amount,
        running_balance=expense.running_balance,
        category_tage=expense.category_tage,
        payment_by=expense.payment_by,
        created_by=expense.created_by,
        updated_by=expense.updated_by,
        updated_at=expense.updated_at,
        fund_account=fund_account,
        created_by_name=created_by_name,
        updated_by_name=updated_by_name,
        bills=bills,
    )


@router.get("", response_model=ExpenseListResponse)
async def get_expenses(
    from_date: str = Query(..., description="ISO start date or datetime"),
    to_date: str = Query(..., description="ISO end date or datetime"),
    user_id: int = Query(..., description="Pass 0 to return all expenses"),
    db: Session = Depends(get_db),
):
    """Get expenses filtered by date range and optional fund deposit owner."""
    start_at = _parse_range_boundary(from_date, end_of_day=False)
    end_at = _parse_range_boundary(to_date, end_of_day=True)
    if start_at > end_at:
        raise HTTPException(status_code=400, detail="from_date must be less than or equal to to_date")

    query = _expense_query(db).filter(
        Expense.date_of_expense >= start_at,
        Expense.date_of_expense <= end_at,
    )
    if user_id != 0:
        query = query.filter(FundDeposit.added_by == user_id)

    rows = query.order_by(Expense.id.desc()).all()
    data = [
        _serialize_expense(
            expense,
            fund_account,
            created_by_name,
            updated_by_name,
            encode_bill_data=True,
        )
        for expense, fund_account, created_by_name, updated_by_name in rows
    ]

    latest_expense_ids_query = (
        db.query(
            Expense.fund_account_id.label("fund_account_id"),
            func.max(Expense.id).label("latest_expense_id"),
        )
        .join(FundDeposit, Expense.fund_account_id == FundDeposit.id)
        .filter(Expense.date_of_expense <= end_at)
    )
    if user_id != 0:
        latest_expense_ids_query = latest_expense_ids_query.filter(FundDeposit.added_by == user_id)

    latest_expense_ids_subquery = (
        latest_expense_ids_query
        .group_by(Expense.fund_account_id)
        .subquery()
    )

    latest_running_balance_total = (
        db.query(
            func.coalesce(func.sum(Expense.running_balance), 0)
        )
        .join(
            latest_expense_ids_subquery,
            Expense.id == latest_expense_ids_subquery.c.latest_expense_id,
        )
        .scalar()
    )
    latest_running_balance = float(latest_running_balance_total or 0.0)

    return {
        "data": data,
        "summary": {
            "latest_running_balance": latest_running_balance,
        },
    }


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(
    fund_account_id: int = Form(...),
    date_of_expense: str = Form(...),
    timezone: str = Form(..., description="IANA timezone (e.g., 'Asia/Kolkata', 'UTC')"),
    purpose: str = Form(...),
    withdrawn_amount: float = Form(...),
    returned_amount: float = Form(0.0),
    category_tage: str = Form(...),
    payment_by: str = Form(...),
    created_by: Optional[str] = Form(None),
    updated_by: Optional[str] = Form(None),
    bills: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    """Create an expense row and optionally upload bill files."""

    try:
        utc_date_of_expense = convert_to_utc(date_of_expense, timezone)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    fund_deposit = db.query(FundDeposit).filter(FundDeposit.id == fund_account_id).first()
    if fund_deposit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fund deposit not found")

    # Get latest running balance from tbl_expenses
    latest_expense = (
        db.query(Expense)
        .filter(Expense.fund_account_id == fund_account_id)
        .order_by(Expense.id.desc())
        .first()
    )

    # If no expense exists yet, use fund deposit balance
    if latest_expense:
        current_balance = float(latest_expense.running_balance or 0.0)
    else:
        current_balance = (
            float(fund_deposit.deposited_fund or 0.0)
            + float(fund_deposit.opening_balance or 0.0)
        )

    net_deduction = (
        float(withdrawn_amount or 0.0)
        - float(returned_amount or 0.0)
    )

    if net_deduction > current_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient fund balance"
        )

    running_balance = current_balance - net_deduction

    # Create expense first so we have the expense_id for file naming
    item = Expense(
        fund_account_id=fund_account_id,
        date_of_expense=utc_date_of_expense,
        purpose=purpose,
        withdrawn_amount=withdrawn_amount,
        returned_amount=returned_amount,
        running_balance=running_balance,
        category_tage=category_tage,
        payment_by=payment_by,
        created_by=created_by,
        updated_by=updated_by,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    # Upload all bill files AFTER expense is created, using expense_id in filename
    bill_index = 1
    first_bill_url: str | None = None
    for bill_file in bills:
        if not bill_file.filename:
            continue
        file_bytes = await bill_file.read()
        if not file_bytes:
            continue
        try:
            logger.info(f"Uploading bill for expense {item.id}: {bill_file.filename} (content_type={bill_file.content_type})")
            url = upload_bill_file(
                file_bytes=file_bytes,
                content_type=bill_file.content_type,
                filename=bill_file.filename,
                expense_id=item.id,
                fund_account=fund_deposit.fund_account,
                bill_index=bill_index,
            )
            logger.info(f"Upload successful. URL: {url}")
            if not url or not isinstance(url, str) or not url.startswith("https://"):
                raise ValueError("Invalid blob URL returned from upload service")
            db.add(ExpenseBill(expense_id=item.id, bill_url=url))
            if first_bill_url is None:
                first_bill_url = url
            bill_index += 1
        except ValueError as exc:
            logger.error(f"File upload failed for expense {item.id}: {str(exc)}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File upload failed: {str(exc)}")
        except Exception as exc:
            logger.error(f"Unexpected upload error for expense {item.id}: {str(exc)}", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Unexpected upload error: {str(exc)}")
    
    # Net debit after returned amount adjustment
    net_debit = (
        float(item.withdrawn_amount or 0.0)
        - float(item.returned_amount or 0.0)
    )

    add_fund_deposit_history(
        db,
        fund_account_id=item.fund_account_id,
        transaction_date=item.date_of_expense,
        credit=0.0,
        debit=net_debit,
        reference=item.purpose,
        bill_file=first_bill_url,
        added_by=item.created_by,
    )
    db.commit()

    row = _expense_query(db).filter(Expense.id == item.id).first()
    return _serialize_expense(row[0], row[1], row[2], row[3])


@router.put("/{id}", response_model=ExpenseResponse)
async def update_expense(
    id: int,
    fund_account_id: Optional[int] = Form(None),
    date_of_expense: Optional[str] = Form(None),
    timezone: str = Form(default="UTC", description="IANA timezone for date_of_expense conversion"),
    purpose: Optional[str] = Form(None),
    withdrawn_amount: Optional[float] = Form(None),
    returned_amount: Optional[float] = Form(None),
    category_tage: Optional[str] = Form(None),
    payment_by: Optional[str] = Form(None),
    created_by: Optional[str] = Form(None),
    updated_by: Optional[str] = Form(None),
    bills: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    """Update an expense row by id and optionally attach new bill files."""

    item = db.query(Expense).filter(Expense.id == id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    if fund_account_id is not None:
        item.fund_account_id = fund_account_id
    if date_of_expense is not None:
        try:
            item.date_of_expense = convert_to_utc(date_of_expense, timezone)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if purpose is not None:
        item.purpose = purpose
    if withdrawn_amount is not None:
        item.withdrawn_amount = withdrawn_amount
    if returned_amount is not None:
        item.returned_amount = returned_amount
    if category_tage is not None:
        item.category_tage = category_tage
    if payment_by is not None:
        item.payment_by = payment_by
    if created_by is not None:
        item.created_by = created_by
    if updated_by is not None:
        item.updated_by = updated_by

    fund_deposit = db.query(FundDeposit).filter(FundDeposit.id == item.fund_account_id).first()
    if fund_deposit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fund deposit not found")

    # Get latest running balance from tbl_expenses excluding current record
    latest_expense = (
        db.query(Expense)
        .filter(
            Expense.fund_account_id == item.fund_account_id,
            Expense.id != item.id
        )
        .order_by(Expense.id.desc())
        .first()
    )

    # If previous expense exists use its running_balance
    if latest_expense:
        current_balance = float(latest_expense.running_balance or 0.0)
    else:
        current_balance = (
            float(fund_deposit.deposited_fund or 0.0)
            + float(fund_deposit.opening_balance or 0.0)
        )

    # Actual spent amount
    net_deduction = (
        float(item.withdrawn_amount or 0.0)
        - float(item.returned_amount or 0.0)
    )

    if net_deduction > current_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient fund balance"
        )

    # Final running balance
    item.running_balance = current_balance - net_deduction

    db.commit()
    db.refresh(item)

    # Upload new bill files AFTER expense is updated, using expense_id in filename
    bill_index = 1
    first_bill_url: str | None = None
    for bill_file in bills:
        if not bill_file.filename:
            continue
        file_bytes = await bill_file.read()
        if not file_bytes:
            continue
        try:
            logger.info(f"Uploading bill for expense {item.id}: {bill_file.filename} (content_type={bill_file.content_type})")
            url = upload_bill_file(
                file_bytes=file_bytes,
                content_type=bill_file.content_type,
                filename=bill_file.filename,
                expense_id=item.id,
                fund_account=fund_deposit.fund_account,
                bill_index=bill_index,
            )
            logger.info(f"Upload successful. URL: {url}")
            if not url or not isinstance(url, str) or not url.startswith("https://"):
                raise ValueError("Invalid blob URL returned from upload service")
            db.add(ExpenseBill(expense_id=item.id, bill_url=url))
            if first_bill_url is None:
                first_bill_url = url
            bill_index += 1
        except ValueError as exc:
            logger.error(f"File upload failed for expense {item.id}: {str(exc)}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File upload failed: {str(exc)}")
        except Exception as exc:
            logger.error(f"Unexpected upload error for expense {item.id}: {str(exc)}", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Unexpected upload error: {str(exc)}")

    # Net debit after returned amount adjustment
    net_debit = (
        float(item.withdrawn_amount or 0.0)
        - float(item.returned_amount or 0.0)
    )

    # Find latest history record for this expense/fund account
    history = (
        db.query(FundDepositHistory)
        .filter(FundDepositHistory.fund_account_id == item.fund_account_id)
        .order_by(FundDepositHistory.id.desc())
        .first()
    )

    if history:
        history.transaction_date = item.date_of_expense
        history.debit = net_debit
        history.reference = item.purpose

        if first_bill_url:
            history.bill_file = first_bill_url

        history.added_by = (
            item.updated_by
            if item.updated_by is not None
            else item.created_by
        )

        # Update running balance same as tbl_expenses
        history.running_balance = item.running_balance
    db.commit()

    row = _expense_query(db).filter(Expense.id == item.id).first()
    return _serialize_expense(row[0], row[1], row[2], row[3])


@router.delete("/{id}", status_code=status.HTTP_200_OK)
async def delete_expense(
    id: int,
    db: Session = Depends(get_db),
):
    """Delete an expense row by id."""
    item = db.query(Expense).filter(Expense.id == id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    db.delete(item)
    db.commit()
    return {"message": "Expense deleted successfully"}