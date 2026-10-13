"""Pydantic schemas for tbl_users."""
from datetime import datetime

from pydantic import BaseModel


class UserBase(BaseModel):
    """Shared tbl_users fields."""

    first_name: str
    last_name: str
    email: str
    hashed_password: str
    phone: str | None = None
    role: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    is_active: bool = True


class UserCreate(UserBase):
    """Create payload for tbl_users."""


class UserUpdate(BaseModel):
    """Update payload for tbl_users (no password editing)."""

    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    role: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    is_deleted: bool | None = None
    is_active: bool | None = None


class UserResponse(UserBase):
    """Response schema for tbl_users."""

    id: int

    class Config:
        from_attributes = True
