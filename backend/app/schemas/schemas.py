"""Pydantic request/response schemas."""
from datetime import datetime

from pydantic import BaseModel, EmailStr, computed_field


class UserBase(BaseModel):
    """Base user schema."""

    email: EmailStr
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    role: str | None = None


class UserCreate(UserBase):
    """User creation schema."""

    password: str


class UserUpdate(BaseModel):
    """User update schema."""

    email: EmailStr | None = None
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    role: str | None = None
    password: str | None = None


class UserResponse(BaseModel):
    """User response schema."""

    id: int
    first_name: str | None
    last_name: str | None
    email: str
    phone: str | None
    role: str | None
    is_active: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def full_name(self) -> str | None:
        """Compute full_name from first_name + last_name."""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.first_name or self.last_name or None

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    """Login request schema."""

    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Login response schema."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    """Refresh token request schema."""

    refresh_token: str


class PasswordResetRequest(BaseModel):
    """Password reset request schema."""

    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Password reset confirmation schema."""

    email: EmailStr
    otp_code: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    """Change password request schema."""

    current_password: str
    new_password: str


class VerifyEmailRequest(BaseModel):
    """Verify email request schema."""

    token: str
