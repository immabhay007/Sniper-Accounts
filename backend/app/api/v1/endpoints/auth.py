"""Authentication endpoints."""
import logging
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.core.datetime_utils import get_utc_now
from app.core.email_utils import send_password_reset_email, send_verification_email
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.db.session import get_db
from app.models.models import PasswordResetOtp, User
from app.schemas.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshTokenRequest,
    UserCreate,
    UserResponse,
    VerifyEmailRequest,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user."""
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create new user
    new_user = User(
        email=user_data.email,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        phone=user_data.phone,
        role=user_data.role or "user",
        hashed_password=get_password_hash(user_data.password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Send verification email
    verification_token = create_access_token(
        {"sub": str(new_user.id), "type": "email_verification"},
        expires_delta=timedelta(hours=24),
    )
    settings = get_settings()
    app_url = settings.frontend_reset_url or "http://localhost:3000"
    send_verification_email(
        new_user.email,
        verification_token,
        app_url,
    )

    return new_user


@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return tokens."""
    
    logger.debug("Login request started")

    try:
        try:
            user = db.query(User).filter(
                User.email == credentials.email
            ).first()

        except OperationalError as e:
            logger.warning(
                "Database connection stale. Retrying once..."
            )

            db.rollback()

            # retry once with fresh connection
            user = db.query(User).filter(
                User.email == credentials.email
            ).first()

    except OperationalError as e:
        db.rollback()

        logger.exception("Database operational error during login")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e.orig) if hasattr(e, "orig") else str(e),
        )

    except SQLAlchemyError as e:
        db.rollback()

        logger.exception("Database error during login")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e.orig) if hasattr(e, "orig") else str(e),
        )

    except Exception as e:
        logger.exception("Unexpected login error")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

    if not user or not verify_password(
        credentials.password,
        user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    access_token = create_access_token(
        {"sub": str(user.id)}
    )

    refresh_token = create_refresh_token(
        {"sub": str(user.id)}
    )

    logger.debug("Login request completed successfully")

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user,
    }

@router.post("/refresh-token", response_model=LoginResponse)
async def refresh_token(req: RefreshTokenRequest, db: Session = Depends(get_db)):
    """Refresh access token using refresh token."""
    payload = decode_token(req.refresh_token)

    if payload is None or payload.get("token_type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Create new tokens
    access_token = create_access_token({"sub": str(user.id)})
    new_refresh_token = create_refresh_token({"sub": str(user.id)})

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "user": user,
    }


@router.post("/password-reset-request")
async def request_password_reset(req: PasswordResetRequest, db: Session = Depends(get_db)):
    """Request password reset via OTP."""
    settings = get_settings()
    app_url = settings.frontend_reset_url or "http://localhost:3000"

    user = db.query(User).filter(User.email == req.email).first()

    if not user:
        # Don't reveal if user exists
        return {"message": "If the email exists, a reset code will be sent"}

    # Generate OTP
    otp_code = str(secrets.randbelow(1000000)).zfill(6)
    expires_at = get_utc_now() + timedelta(hours=1)

    reset_otp = PasswordResetOtp(
        user_id=user.id,
        otp_code=otp_code,
        expires_at=expires_at,
    )
    db.add(reset_otp)

    # Send OTP via email
    email_sent = send_password_reset_email(
        user.email,
        otp_code,
        app_url,
    )

    if not email_sent:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send reset OTP email. Please try again later.",
        )

    db.commit()

    return {"message": "If the email exists, a reset code will be sent"}


@router.post("/password-reset-confirm", response_model=UserResponse)
async def confirm_password_reset(
    req: PasswordResetConfirm, db: Session = Depends(get_db)
):
    """Confirm password reset with OTP."""
    user = db.query(User).filter(User.email == req.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Find valid OTP
    otp = (
        db.query(PasswordResetOtp)
        .filter(
            PasswordResetOtp.user_id == user.id,
            PasswordResetOtp.otp_code == req.otp_code,
            PasswordResetOtp.is_used == False,
            PasswordResetOtp.expires_at > get_utc_now(),
        )
        .first()
    )

    if not otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP",
        )

    # Mark OTP as used
    otp.is_used = True

    # Update password
    user.hashed_password = get_password_hash(req.new_password)
    user.updated_at = get_utc_now()

    db.commit()
    db.refresh(user)

    return user


@router.post("/change-password", response_model=UserResponse)
async def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change password for authenticated user."""
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    current_user.hashed_password = get_password_hash(req.new_password)
    current_user.updated_at = get_utc_now()
    db.commit()
    db.refresh(current_user)

    return current_user


@router.post("/verify-email", response_model=UserResponse)
async def verify_email(
    req: VerifyEmailRequest, db: Session = Depends(get_db)
):
    """Verify user email with token."""
    payload = decode_token(req.token)

    if payload is None or payload.get("type") != "email_verification":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token",
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.is_verified = True
    user.updated_at = get_utc_now()
    db.commit()
    db.refresh(user)

    return user


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current authenticated user info."""
    return current_user
