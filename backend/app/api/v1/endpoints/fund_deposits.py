"""Fund deposit endpoints."""
import base64
import logging
import mimetypes
from datetime import datetime, time
from typing import List, Optional
from urllib.parse import urlsplit
from urllib.request import Request as URLRequest, urlopen

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import String, cast, func, text
from sqlalchemy.orm import Session

from app.core.datetime_utils import convert_to_utc
from app.db.session import get_db
from app.models import Expense
from app.models.models import FundDeposit, FundDepositHistory, FundDepositsBill, User
from app.schemas.fund_deposits import FundDepositAccountResponse, FundDepositResponse, FundDepositUpdate
from app.schemas.fund_deposits_history import FundDepositsHistoryResponse
from app.schemas.fund_deposits_list_response import FundDepositListResponse
from app.services.azure_blob_storage import upload_bill_file
from app.services.fund_deposits_history import add_fund_deposit_history

logger = logging.getLogger(__name__)
router = APIRouter()


def _bill_url_to_data_uri(url: str) -> str:
    """Fetch a blob URL and convert it to a base64 data URI."""
    normalized_url = (url or "").strip()

    if normalized_url.startswith("data:"):
        return normalized_url

    if not normalized_url.startswith(("http://", "https://")):
        raise ValueError("bill_file must be an http(s) URL or data URI")

    request = URLRequest(normalized_url, headers={"User-Agent": "sniper-backend/1.0", "Accept": "*/*"})
    with urlopen(request, timeout=20) as response:  # nosec B310 - trusted URL from DB
        payload = response.read()
        content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()

    if not content_type:
        guessed_type, _ = mimetypes.guess_type(urlsplit(normalized_url).path)
        content_type = guessed_type or "application/octet-stream"

    encoded = base64.b64encode(payload).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def _coerce_added_by_user_id(added_by: int | str | None) -> int | None:
    """Coerce added_by into user id for tbl_fund_deposits nullable BIGINT column."""
    if isinstance(added_by, int):
        return added_by
    if isinstance(added_by, str):
        raw = added_by.strip()
        if raw.isdigit():
            return int(raw)
    return None


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


def _serialize_fund_deposit_with_effective_balance(item: FundDeposit) -> dict:
    """Serialize a fund deposit with deposited_fund including opening_balance."""
    return {
        "id": item.id,
        "fund_account": item.fund_account,
        "budgeted_fund": item.budgeted_fund,
        "opening_balance": float(item.opening_balance or 0.0),
        "deposited_fund": float(item.deposited_fund or 0.0) + float(item.opening_balance or 0.0),
        "date_of_deposit": item.date_of_deposit,
        "mode_of_transfer": item.mode_of_transfer,
        "remarks": item.remarks,
        "added_by": item.added_by,
    }


@router.get("", response_model=FundDepositListResponse)
async def get_fund_deposits(
    from_date: str = Query(..., description="ISO start date or datetime"),
    to_date: str = Query(..., description="ISO end date or datetime"),
    user_id: int = Query(..., description="Pass 0 to return all fund deposits"),
    db: Session = Depends(get_db),
):
    """Get fund deposits filtered by date range and optional user_id."""
    
    start_at = _parse_range_boundary(from_date, end_of_day=False)
    end_at = _parse_range_boundary(to_date, end_of_day=True)

    if start_at > end_at:
        raise HTTPException(
            status_code=400,
            detail="from_date must be less than or equal to to_date"
        )

    query = db.query(FundDeposit).filter(
        FundDeposit.date_of_deposit >= start_at,
        FundDeposit.date_of_deposit <= end_at,
    )

    if user_id != 0:
        query = query.filter(FundDeposit.added_by == user_id)

    fund_deposits = query.order_by(FundDeposit.id.desc()).all()

    opening_deposited_amount_query = db.query(
        func.coalesce(
            func.sum(
                FundDeposit.deposited_fund + FundDeposit.opening_balance
            ),
            0,
        )
    ).filter(FundDeposit.date_of_deposit < start_at)

    if user_id != 0:
        opening_deposited_amount_query = opening_deposited_amount_query.filter(
            FundDeposit.added_by == user_id
        )

    opening_deposited_amount = float(opening_deposited_amount_query.scalar() or 0.0)

    opening_spent_amount_query = (
        db.query(
            func.coalesce(
                func.sum(
                    Expense.withdrawn_amount - Expense.returned_amount
                ),
                0,
            )
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
        opening_spent_amount_query = opening_spent_amount_query.filter(
            FundDeposit.added_by == user_id
        )

    opening_spent_amount = float(opening_spent_amount_query.scalar() or 0.0)

    period_deposited_amount_query = db.query(
        func.coalesce(
            func.sum(
                FundDeposit.deposited_fund + FundDeposit.opening_balance
            ),
            0,
        )
    ).filter(
        FundDeposit.date_of_deposit >= start_at,
        FundDeposit.date_of_deposit <= end_at,
    )

    if user_id != 0:
        period_deposited_amount_query = period_deposited_amount_query.filter(
            FundDeposit.added_by == user_id
        )

    period_deposited_amount = float(period_deposited_amount_query.scalar() or 0.0)

    period_spent_amount_query = (
        db.query(
            func.coalesce(
                func.sum(
                    Expense.withdrawn_amount - Expense.returned_amount
                ),
                0,
            )
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
        period_spent_amount_query = period_spent_amount_query.filter(
            FundDeposit.added_by == user_id
        )

    period_spent_amount = float(period_spent_amount_query.scalar() or 0.0)

    response = []
    total_deposited = 0.0
    total_spent = 0.0
    net_balance = 0.0

    for item in fund_deposits:
        # total_spent = SUM(withdrawn_amount - returned_amount)
        item_total_spent = (
            db.query(
                func.coalesce(
                    func.sum(
                        Expense.withdrawn_amount - Expense.returned_amount
                    ),
                    0
                )
            )
            .filter(Expense.fund_account_id == item.id)
            .scalar()
        )

        # Get latest running_balance from FundDepositHistory
        running_balance = db.query(FundDepositHistory.running_balance).filter(
            FundDepositHistory.fund_account_id == item.id
        ).order_by(FundDepositHistory.transaction_date.desc()).first()
        running_balance_value = float(running_balance[0]) if running_balance else 0.0

        data = _serialize_fund_deposit_with_effective_balance(item)
        data["total_spent"] = float(item_total_spent or 0)
        data["running_balance"] = running_balance_value

        response.append(data)

        total_deposited += float(item.deposited_fund or 0.0) + float(item.opening_balance or 0.0)
        total_spent += float(item_total_spent or 0.0)
        net_balance += running_balance_value

    net_balance = (
        opening_deposited_amount
        - opening_spent_amount
        + period_deposited_amount
        - period_spent_amount
    )

    return {
        "data": response,
        "summary": {
            "total_deposited": total_deposited,
            "total_spent": total_spent,
            "net_balance": net_balance
        }
    }


@router.get("/accounts", response_model=list[FundDepositAccountResponse])
async def get_fund_deposit_accounts(db: Session = Depends(get_db)):
    """Get fund deposit id and fund_account without filters."""
    rows = db.query(FundDeposit.id, FundDeposit.fund_account).order_by(FundDeposit.id.desc()).all()
    return [
        FundDepositAccountResponse(id=row.id, fund_account=row.fund_account)
        for row in rows
    ]


@router.get("/{id}", response_model=FundDepositResponse)
async def get_fund_deposit_by_id(
    id: int,
    db: Session = Depends(get_db),
):
    """Get a single fund deposit by id."""
    item = db.query(FundDeposit).filter(FundDeposit.id == id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fund deposit not found")

    return _serialize_fund_deposit_with_effective_balance(item)


@router.post("/", response_model=FundDepositResponse, status_code=status.HTTP_201_CREATED)
async def create_fund_deposit(
    fund_account: str = Form(...),
    budgeted_fund: float = Form(...),
    opening_balance: float = Form(...),
    deposited_fund: float = Form(...),
    date_of_deposit: str = Form(..., description="ISO date or datetime string"),
    timezone: str = Form(..., description="IANA timezone (e.g., 'Asia/Kolkata', 'UTC')"),
    mode_of_transfer: str = Form(...),
    remarks: Optional[str] = Form(None),
    added_by: Optional[str] = Form(None),
    bills: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    """Create a fund deposit row and optionally upload bill files. Converts date_of_deposit to UTC based on timezone."""
    try:
        utc_date_of_deposit = convert_to_utc(date_of_deposit, timezone)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    
    payload_data = {
        "fund_account": fund_account,
        "budgeted_fund": budgeted_fund,
        "opening_balance": opening_balance,
        "deposited_fund": deposited_fund,
        "date_of_deposit": utc_date_of_deposit,
        "mode_of_transfer": mode_of_transfer,
        "remarks": remarks,
        "added_by": _coerce_added_by_user_id(added_by),
    }
    item = FundDeposit(**payload_data)
    db.add(item)
    db.commit()
    db.refresh(item)

    # Read and store all bill files before uploading (UploadFile can only be read once)
    bill_data = []
    for bill_file in bills:
        if not bill_file.filename:
            continue
        file_bytes = await bill_file.read()
        if not file_bytes:
            continue
        bill_data.append((bill_file.filename, bill_file.content_type, file_bytes))

    # Upload bill files AFTER deposit is created
    bill_index = 1
    first_bill_url: str | None = None
    uploaded_urls = []
    for filename, content_type, file_bytes in bill_data:
        try:
            logger.info(f"Uploading bill for fund deposit {item.id}: {filename} (content_type={content_type})")
            url = upload_bill_file(
                file_bytes=file_bytes,
                content_type=content_type,
                filename=filename,
                expense_id=item.id,
                fund_account=item.fund_account,
                bill_index=bill_index,
            )
            logger.info(f"Upload successful. URL: {url}")
            if not url or not isinstance(url, str) or not url.startswith("https://"):
                raise ValueError("Invalid blob URL returned from upload service")
            if first_bill_url is None:
                first_bill_url = url
            uploaded_urls.append(url)
            bill_index += 1
        except ValueError as exc:
            logger.error(f"File upload failed for fund deposit {item.id}: {str(exc)}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File upload failed: {str(exc)}")
        except Exception as exc:
            logger.error(f"Unexpected upload error for fund deposit {item.id}: {str(exc)}", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Unexpected upload error: {str(exc)}")

    add_fund_deposit_history(
        db,
        fund_account_id=item.id,
        transaction_date=item.date_of_deposit,
        credit=item.deposited_fund,
        debit=0.0,
        reference=item.remarks,
        bill_file=first_bill_url,
        added_by=added_by,
    )
    db.commit()
    
    # Get the history record id to link bills
    history = db.query(FundDepositHistory).filter(
        FundDepositHistory.fund_account_id == item.id
    ).order_by(FundDepositHistory.id.desc()).first()
    
    if history and uploaded_urls:
        # Link uploaded bills to history record
        for url in uploaded_urls:
            db.add(FundDepositsBill(deposit_id=history.id, bill_url=url))
        db.commit()

    # Calculate total_spent
    total_spent = (
        db.query(
            func.coalesce(
                func.sum(
                    Expense.withdrawn_amount - Expense.returned_amount
                ),
                0
            )
        )
        .filter(Expense.fund_account_id == item.id)
        .scalar()
    )

    # Get latest running_balance from FundDepositHistory
    running_balance = db.query(FundDepositHistory.running_balance).filter(
        FundDepositHistory.fund_account_id == item.id
    ).order_by(FundDepositHistory.transaction_date.desc()).first()
    running_balance_value = float(running_balance[0]) if running_balance else 0.0

    data = _serialize_fund_deposit_with_effective_balance(item)
    data["total_spent"] = float(total_spent or 0)
    data["running_balance"] = running_balance_value
    return data


@router.put("/{id}", response_model=FundDepositResponse)
async def update_fund_deposit(
    id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Update a fund deposit row by id and optionally attach bill files."""
    
    item = db.query(FundDeposit).filter(FundDeposit.id == id).first()

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fund deposit not found"
        )

    content_type = (request.headers.get("content-type") or "").lower()
    payload_data: dict = {}
    bill_files: list[UploadFile] = []

    if "application/json" in content_type:
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload") from exc

        if body is None:
            body = {}
        if not isinstance(body, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON body must be an object")

        try:
            payload = FundDepositUpdate.model_validate(body)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

        payload_data = payload.model_dump(exclude_unset=True)
    elif "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
        form = await request.form()

        form_payload = {
            "fund_account": form.get("fund_account"),
            "budgeted_fund": form.get("budgeted_fund"),
            "opening_balance": form.get("opening_balance"),
            "deposited_fund": form.get("deposited_fund"),
            "date_of_deposit": form.get("date_of_deposit"),
            "mode_of_transfer": form.get("mode_of_transfer"),
            "remarks": form.get("remarks"),
            "added_by": form.get("added_by"),
            "timezone": form.get("timezone"),
        }
        cleaned_payload = {k: v for k, v in form_payload.items() if v not in (None, "")}

        try:
            payload = FundDepositUpdate.model_validate(cleaned_payload)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

        payload_data = payload.model_dump(exclude_unset=True)
        bill_files = [f for f in form.getlist("bills") if hasattr(f, "read") and getattr(f, "filename", None)]
    else:
        # Fallback: try parsing JSON if content-type is missing or unusual.
        try:
            body = await request.json()
        except Exception:
            body = {}

        if isinstance(body, dict) and body:
            try:
                payload = FundDepositUpdate.model_validate(body)
            except Exception as exc:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
            payload_data = payload.model_dump(exclude_unset=True)

    update_data = {
        "fund_account": payload_data.get("fund_account"),
        "budgeted_fund": payload_data.get("budgeted_fund"),
        "opening_balance": payload_data.get("opening_balance"),
        "deposited_fund": payload_data.get("deposited_fund"),
        "date_of_deposit": payload_data.get("date_of_deposit"),
        "mode_of_transfer": payload_data.get("mode_of_transfer"),
        "remarks": payload_data.get("remarks"),
        "added_by": _coerce_added_by_user_id(payload_data.get("added_by")),
    }

    effective_timezone = payload_data.get("timezone") or "UTC"

    if update_data["date_of_deposit"]:
        date_value = update_data["date_of_deposit"]
        date_input = date_value.isoformat() if isinstance(date_value, datetime) else str(date_value)
        try:
            update_data["date_of_deposit"] = convert_to_utc(
                date_input,
                effective_timezone
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc)
            )

    # Update fields
    for key, value in update_data.items():
        if value is not None:
            setattr(item, key, value)

    db.commit()
    db.refresh(item)

    # Read and store all bill files before uploading (UploadFile can only be read once)
    bill_data = []
    for bill_file in bill_files:
        if not bill_file.filename:
            continue
        file_bytes = await bill_file.read()
        if not file_bytes:
            continue
        bill_data.append((bill_file.filename, bill_file.content_type, file_bytes))

    # Upload bill files AFTER the deposit row is updated
    bill_index = 1
    first_bill_url: str | None = None
    uploaded_urls = []
    for filename, content_type, file_bytes in bill_data:
        try:
            logger.info(f"Uploading bill for fund deposit {item.id}: {filename} (content_type={content_type})")
            url = upload_bill_file(
                file_bytes=file_bytes,
                content_type=content_type,
                filename=filename,
                expense_id=item.id,
                fund_account=item.fund_account,
                bill_index=bill_index,
            )
            logger.info(f"Upload successful. URL: {url}")
            if not url or not isinstance(url, str) or not url.startswith("https://"):
                raise ValueError("Invalid blob URL returned from upload service")
            if first_bill_url is None:
                first_bill_url = url
            uploaded_urls.append(url)
            bill_index += 1
        except ValueError as exc:
            logger.error(f"File upload failed for fund deposit {item.id}: {str(exc)}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File upload failed: {str(exc)}")
        except Exception as exc:
            logger.error(f"Unexpected upload error for fund deposit {item.id}: {str(exc)}", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Unexpected upload error: {str(exc)}")

    if uploaded_urls:
        add_fund_deposit_history(
            db,
            fund_account_id=item.id,
            transaction_date=item.date_of_deposit,
            credit=0.0,
            debit=0.0,
            reference=item.remarks,
            bill_file=first_bill_url,
            added_by=item.added_by,
        )
        db.commit()

        # Get the history record id to link bills
        history = db.query(FundDepositHistory).filter(
            FundDepositHistory.fund_account_id == item.id
        ).order_by(FundDepositHistory.id.desc()).first()

        if history:
            # Link uploaded bills to history record
            for url in uploaded_urls:
                db.add(FundDepositsBill(deposit_id=history.id, bill_url=url))
            db.commit()

    # Calculate total_spent
    total_spent = (
        db.query(
            func.coalesce(
                func.sum(
                    Expense.withdrawn_amount - Expense.returned_amount
                ),
                0
            )
        )
        .filter(Expense.fund_account_id == item.id)
        .scalar()
    )

    # Get latest running_balance from FundDepositHistory
    running_balance = db.query(FundDepositHistory.running_balance).filter(
        FundDepositHistory.fund_account_id == item.id
    ).order_by(FundDepositHistory.transaction_date.desc()).first()
    running_balance_value = float(running_balance[0]) if running_balance else 0.0

    data = _serialize_fund_deposit_with_effective_balance(item)
    data["total_spent"] = float(total_spent or 0)
    data["running_balance"] = running_balance_value
    return data


@router.put("/{id}/add-amount", response_model=FundDepositResponse)
async def add_fund_deposit_amount(
    id: int,
    deposited_fund: float = Form(...),
    date_of_deposit: str = Form(..., description="ISO date or datetime string"),
    timezone: str = Form(..., description="IANA timezone (e.g., 'Asia/Kolkata', 'UTC')"),
    mode_of_transfer: str = Form(...),
    added_by: Optional[str] = Form(None),
    bills: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    """Add amount to deposited_fund and update transfer metadata for a row. Converts date_of_deposit to UTC based on timezone. Optionally upload bill files."""
    item = db.query(FundDeposit).filter(FundDeposit.id == id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fund deposit not found")

    if deposited_fund <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="deposited_fund must be greater than 0")

    try:
        utc_date_of_deposit = convert_to_utc(date_of_deposit, timezone)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    item.deposited_fund = float(item.deposited_fund) + float(deposited_fund)
    item.date_of_deposit = utc_date_of_deposit
    item.mode_of_transfer = mode_of_transfer
    item.added_by = _coerce_added_by_user_id(added_by)

    db.commit()
    db.refresh(item)

    # Calculate latest running_balance from tbl_expenses for same fund_account_id
    latest_expense = (
        db.query(Expense)
        .filter(Expense.fund_account_id == item.id)
        .order_by(Expense.id.desc())
        .first()
    )

    # Update latest expense running_balance
    if latest_expense:
        latest_expense.running_balance = float(latest_expense.running_balance or 0) + float(deposited_fund)
        db.commit()

    # Read and store all bill files before uploading (UploadFile can only be read once)
    bill_data = []
    for bill_file in bills:
        if not bill_file.filename:
            continue
        file_bytes = await bill_file.read()
        if not file_bytes:
            continue
        bill_data.append((bill_file.filename, bill_file.content_type, file_bytes))

    # Upload bill files AFTER amount is added
    bill_index = 1
    first_bill_url: str | None = None
    uploaded_urls = []
    for filename, content_type, file_bytes in bill_data:
        try:
            logger.info(f"Uploading bill for fund deposit {item.id}: {filename} (content_type={content_type})")
            url = upload_bill_file(
                file_bytes=file_bytes,
                content_type=content_type,
                filename=filename,
                expense_id=item.id,
                fund_account=item.fund_account,
                bill_index=bill_index,
            )
            logger.info(f"Upload successful. URL: {url}")
            if not url or not isinstance(url, str) or not url.startswith("https://"):
                raise ValueError("Invalid blob URL returned from upload service")
            if first_bill_url is None:
                first_bill_url = url
            uploaded_urls.append(url)
            bill_index += 1
        except ValueError as exc:
            logger.error(f"File upload failed for fund deposit {item.id}: {str(exc)}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File upload failed: {str(exc)}")
        except Exception as exc:
            logger.error(f"Unexpected upload error for fund deposit {item.id}: {str(exc)}", exc_info=True)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Unexpected upload error: {str(exc)}")

    add_fund_deposit_history(
        db,
        fund_account_id=item.id,
        transaction_date=item.date_of_deposit,
        credit=deposited_fund,
        debit=0.0,
        reference=item.remarks,
        bill_file=first_bill_url,
        added_by=added_by,
    )
    db.commit()
    
    # Get the history record id to link bills
    history = db.query(FundDepositHistory).filter(
        FundDepositHistory.fund_account_id == item.id
    ).order_by(FundDepositHistory.id.desc()).first()
    
    if history and uploaded_urls:
        # Link uploaded bills to history record
        for url in uploaded_urls:
            db.add(FundDepositsBill(deposit_id=history.id, bill_url=url))
        db.commit()

    # Calculate total_spent
    total_spent = (
        db.query(
            func.coalesce(
                func.sum(
                    Expense.withdrawn_amount - Expense.returned_amount
                ),
                0
            )
        )
        .filter(Expense.fund_account_id == item.id)
        .scalar()
    )

    # Get latest running_balance from FundDepositHistory
    running_balance = db.query(FundDepositHistory.running_balance).filter(
        FundDepositHistory.fund_account_id == item.id
    ).order_by(FundDepositHistory.transaction_date.desc()).first()
    running_balance_value = float(running_balance[0]) if running_balance else 0.0

    data = _serialize_fund_deposit_with_effective_balance(item)
    data["total_spent"] = float(total_spent or 0)
    data["running_balance"] = running_balance_value
    return data


@router.delete("/{id}", status_code=status.HTTP_200_OK)
async def delete_fund_deposit(
    id: int,
    db: Session = Depends(get_db),
):
    """Delete fund deposit and all related records."""

    item = db.query(FundDeposit).filter(FundDeposit.id == id).first()

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fund deposit not found"
        )

    try:

        # 1. Delete from tbl_deposits_bills
        # tbl_deposits_bills.deposit_id
        # references tbl_fund_deposits_history.id
        db.execute(
            text("""
                DELETE FROM tbl_deposits_bills
                WHERE deposit_id IN (
                    SELECT id
                    FROM tbl_fund_deposits_history
                    WHERE fund_account_id = :id
                )
            """),
            {"id": id}
        )

        # 2. Delete from tbl_fund_deposits_history
        db.execute(
            text("""
                DELETE FROM tbl_fund_deposits_history
                WHERE fund_account_id = :id
            """),
            {"id": id}
        )

        # 3. Delete from tbl_expenses_bills
        # tbl_expenses_bills.expense_id
        # references tbl_expenses.id
        db.execute(
            text("""
                DELETE FROM tbl_expenses_bills
                WHERE expense_id IN (
                    SELECT id
                    FROM tbl_expenses
                    WHERE fund_account_id = :id
                )
            """),
            {"id": id}
        )

        # 4. Delete from tbl_expenses
        db.execute(
            text("""
                DELETE FROM tbl_expenses
                WHERE fund_account_id = :id
            """),
            {"id": id}
        )

        # 5. Finally delete from tbl_fund_deposits
        db.execute(
            text("""
                DELETE FROM tbl_fund_deposits
                WHERE id = :id
            """),
            {"id": id}
        )

        db.commit()

        return {
            "message": "Fund deposit deleted successfully"
        }

    except Exception as e:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/history/all", response_model=list[FundDepositsHistoryResponse])
async def get_fund_deposits_history(
    from_date: str = Query(..., description="ISO start date or datetime"),
    to_date: str = Query(..., description="ISO end date or datetime"),
    fund_account_id: int = Query(..., description="Fund account id"),
    db: Session = Depends(get_db),
):
    """Get fund deposit history rows filtered by date range and fund_account_id with base64 encoded bill URLs."""
    
    start_at = _parse_range_boundary(from_date, end_of_day=False)
    end_at = _parse_range_boundary(to_date, end_of_day=True)

    if start_at > end_at:
        raise HTTPException(
            status_code=400,
            detail="from_date must be less than or equal to to_date"
        )

    # Join with users table
    histories = (
        db.query(
            FundDepositHistory,
            User.first_name,
            User.last_name,
        )
        .outerjoin(
            User,
            cast(FundDepositHistory.added_by, String) == cast(User.id, String)
        )
        .filter(
            FundDepositHistory.fund_account_id == fund_account_id,
            FundDepositHistory.transaction_date >= start_at,
            FundDepositHistory.transaction_date <= end_at,
        )
        .order_by(FundDepositHistory.id.desc())
        .all()
    )

    opening_balance = (
        db.query(FundDeposit.opening_balance)
        .filter(FundDeposit.id == fund_account_id)
        .scalar()
    )

    if opening_balance is None:
        opening_balance = 0.0

    history_ids = [history.id for history, _, _ in histories]

    bill_urls_by_history: dict[int, list[str]] = {}

    if history_ids:
        bill_rows = (
            db.query(
                FundDepositsBill.deposit_id,
                FundDepositsBill.bill_url
            )
            .filter(FundDepositsBill.deposit_id.in_(history_ids))
            .order_by(FundDepositsBill.id.asc())
            .all()
        )

        for row in bill_rows:
            if row.bill_url:
                bill_urls_by_history.setdefault(
                    row.deposit_id,
                    []
                ).append(row.bill_url)

    result = []

    for history, first_name, last_name in histories:

        raw_bill_urls = list(
            bill_urls_by_history.get(history.id, [])
        )

        if history.bill_file and history.bill_file not in raw_bill_urls:
            raw_bill_urls.append(history.bill_file)

        encoded_bill_files: list[str] = []

        for raw_bill_url in raw_bill_urls:
            try:
                encoded_bill_files.append(
                    _bill_url_to_data_uri(raw_bill_url)
                )
            except Exception as exc:
                logger.error(
                    "Failed to convert bill URL to base64 for history %s (url=%s): %s",
                    history.id,
                    raw_bill_url,
                    str(exc),
                )

                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to fetch/encode bill_file for history id {history.id}",
                ) from exc

        # If added_by is numeric and user exists -> return full name
        added_by_value = history.added_by

        raw_added_by = (history.added_by or "").strip()
        if raw_added_by.isdigit() and (first_name or last_name):
            added_by_value = f"{first_name or ''} {last_name or ''}".strip()

        history_dict = {
            "id": history.id,
            "fund_account_id": history.fund_account_id,
            "opening_balance": opening_balance,
            "transaction_date": history.transaction_date,
            "credit": history.credit,
            "debit": history.debit,
            "running_balance": history.running_balance,
            "reference": history.reference,
            "bill_files": encoded_bill_files,
            "added_by": added_by_value,
        }

        result.append(
            FundDepositsHistoryResponse(**history_dict)
        )

    return result