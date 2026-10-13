# --- Password Reset/Forgot Password ---
import secrets
import smtplib
import string
from datetime import timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import BackgroundTasks
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.datetime_utils import get_utc_now
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.models import ResetPasswordOtp, User
from app.schemas.schemas import UserCreate, UserResponse, UserUpdate


router = APIRouter()
public_router = APIRouter()

# --- Password Update Schema ---
class UserPasswordUpdate(BaseModel):
    old_password: str
    new_password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    otp: str


class ResetPasswordWithOtpUpdateRequest(BaseModel):
    otp: str
    new_password: str


def _generate_otp(length: int = 6) -> str:
    digits = string.digits
    return "".join(secrets.choice(digits) for _ in range(length))


def _send_otp_email(to_email: str, otp: str) -> None:
    settings = get_settings()

    message = MIMEMultipart("alternative")
    message["Subject"] = "Your sniper Password Reset OTP"
    message["From"] = f"{settings.zepto_from_name} <{settings.zepto_from_email}>"
    message["To"] = to_email

    html = f"""
    <html>
        <body>
            <p>Hello,</p>
            <p>Your OTP for password reset is:</p>
            <h2>{otp}</h2>
            <p>This OTP is valid for 10 minutes.</p>
            <p>If you did not request this, please ignore this email.</p>
        </body>
    </html>
    """
    message.attach(MIMEText(html, "html"))

    with smtplib.SMTP(settings.zepto_base_url, settings.zepto_smtp_port) as server:
        server.starttls()
        server.login(settings.zepto_smtp_username, settings.zepto_api_token)
        server.send_message(message)

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    """Create a new user."""
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create new user with hashed password (truncate to 72 bytes for bcrypt)
    new_user = User(
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
        role=payload.role,
        hashed_password=get_password_hash(payload.password),
        is_active=True,
        is_deleted=False,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.get("", response_model=list[UserResponse])
async def get_users(
    user_id: int = Query(0, description="User ID (0 = return all users)"),
    db: Session = Depends(get_db),
):
    """Get user(s). If user_id=0, return all users."""
    if user_id == 0:
        # Return all users
        users = db.query(User).all()
        return users
    else:
        # Return specific user
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )
        return [user]


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
):
    """Update a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if email is being changed and if new email already exists
    if payload.email and payload.email != user.email:
        existing_user = db.query(User).filter(User.email == payload.email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use",
            )
        user.email = payload.email

    # Update other fields if provided
    if payload.first_name is not None:
        user.first_name = payload.first_name

    if payload.last_name is not None:
        user.last_name = payload.last_name

    if payload.phone is not None:
        user.phone = payload.phone

    if payload.role is not None:
        user.role = payload.role

    # Password editing is not allowed in update

    user.updated_at = get_utc_now()

    db.commit()
    db.refresh(user)

    return user


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
):
    """Delete a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    db.delete(user)
    db.commit()

    return {"message": "User deleted successfully"}



@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
):
    """Public user registration endpoint."""

    existing_user = (
        db.query(User)
        .filter(User.email == payload.email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    new_user = User(
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
        role=payload.role,
        hashed_password=get_password_hash(payload.password),
        is_active=True,
        is_deleted=False,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user

# --- Password Update Endpoint ---
@router.put("/{user_id}/update-password", status_code=200)
async def update_user_password(
    user_id: int,
    payload: UserPasswordUpdate,
    db: Session = Depends(get_db),
):
    """Update user password if old password matches."""

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from app.core.security import verify_password, get_password_hash

    if not verify_password(payload.old_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Wrong password")

    user.hashed_password = get_password_hash(payload.new_password)
    user.updated_at = get_utc_now()

    db.commit()
    db.refresh(user)

    return {"message": "Password updated successfully"}






@public_router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None,
):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        return {"message": "Email not found"}

    otp = _generate_otp(6)
    now = get_utc_now()

    otp_row = ResetPasswordOtp(
        email=user.email,
        otp=otp,
        expiry=now + timedelta(minutes=10),
        is_verified=False,
        created_at=now,
    )
    db.add(otp_row)
    db.commit()

    try:
        if background_tasks is not None:
            background_tasks.add_task(_send_otp_email, user.email, otp)
        else:
            _send_otp_email(user.email, otp)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send OTP email: {exc}") from exc

    return {"message": "OTP sent successfully"}


@public_router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    now = get_utc_now()
    now_utc_naive = now.astimezone(timezone.utc).replace(tzinfo=None) if now.tzinfo else now
    otp_row = (
        db.query(ResetPasswordOtp)
        .filter(
            ResetPasswordOtp.otp == payload.otp,
            ResetPasswordOtp.is_verified == False,
        )
        .order_by(ResetPasswordOtp.created_at.desc())
        .first()
    )

    if not otp_row:
        return {"status": False}

    expiry = otp_row.expiry
    expiry_naive = expiry.astimezone(timezone.utc).replace(tzinfo=None) if expiry.tzinfo else expiry

    if expiry_naive <= now_utc_naive:
        return {"status": False}

    otp_row.is_verified = True
    db.commit()
    return {"status": True}


@public_router.put("/reset-password/update-with-otp")
async def update_password_with_otp(
    payload: ResetPasswordWithOtpUpdateRequest,
    db: Session = Depends(get_db),
):
    now = get_utc_now()
    now_utc_naive = now.astimezone(timezone.utc).replace(tzinfo=None) if now.tzinfo else now

    otp_row = (
        db.query(ResetPasswordOtp)
        .filter(ResetPasswordOtp.otp == payload.otp)
        .order_by(ResetPasswordOtp.created_at.desc())
        .first()
    )

    if not otp_row:
        return {"status": False, "message": "Invalid OTP"}

    expiry = otp_row.expiry
    expiry_naive = expiry.astimezone(timezone.utc).replace(tzinfo=None) if expiry.tzinfo else expiry

    if expiry_naive <= now_utc_naive:
        return {"status": False, "message": "OTP expired"}

    user = db.query(User).filter(User.email == otp_row.email).first()
    if not user:
        return {"status": False, "message": "User not found"}

    user.hashed_password = get_password_hash(payload.new_password)
    user.updated_at = get_utc_now()
    otp_row.is_verified = True

    db.commit()
    return {"status": True, "message": "Password updated successfully"}








