"""SQLAlchemy ORM models."""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, event
from sqlalchemy.orm import relationship

from app.core.datetime_utils import get_utc_now
from app.db.session import Base


class User(Base):
    """User model."""

    __tablename__ = "tbl_users"

    id = Column(BigInteger, primary_key=True, index=True)
    first_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    role = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=get_utc_now, nullable=False)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now, nullable=False)


class PasswordResetOtp(Base):
    """Password reset OTP model."""

    __tablename__ = "password_reset_otps"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    otp_code = Column(String(6), nullable=False)
    is_used = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=get_utc_now, nullable=False)


class ResetPasswordOtp(Base):
    """OTP records for password reset verification."""

    __tablename__ = "tbl_reset_password_otp"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), index=True, nullable=False)
    otp = Column(String(50), nullable=False)
    expiry = Column(DateTime, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=get_utc_now, nullable=False)


class FundDeposit(Base):
    """Fund deposit model."""

    __tablename__ = "tbl_fund_deposits"

    id = Column(BigInteger, primary_key=True, index=True)
    fund_account = Column(String, nullable=False)
    budgeted_fund = Column(Float, nullable=False)
    opening_balance = Column(Float, nullable=False, default=0.0)
    deposited_fund = Column(Float, nullable=False)
    date_of_deposit = Column(DateTime, nullable=False)
    mode_of_transfer = Column(String(255), nullable=False)
    remarks = Column(String, nullable=True)
    added_by = Column(BigInteger, ForeignKey("tbl_users.id", ondelete="SET NULL", onupdate="CASCADE"), nullable=True)


class FundDepositHistory(Base):
    """Fund deposit history model."""

    __tablename__ = "tbl_fund_deposits_history"

    id = Column(BigInteger, primary_key=True, index=True)
    fund_account_id = Column(BigInteger, ForeignKey("tbl_fund_deposits.id", onupdate="CASCADE"), nullable=False)
    transaction_date = Column(DateTime, nullable=False)
    credit = Column(Float, nullable=False)
    debit = Column(Float, nullable=False)
    running_balance = Column(Float, nullable=False)
    reference = Column(String, nullable=True)
    bill_file = Column(String, nullable=True)
    added_by = Column(String, nullable=True)


class Expense(Base):
    """Expense model."""

    __tablename__ = "tbl_expenses"

    id = Column(BigInteger, primary_key=True, index=True)
    fund_account_id = Column(BigInteger, ForeignKey("tbl_fund_deposits.id", onupdate="CASCADE"), nullable=False)
    date_of_expense = Column(DateTime, nullable=False)
    purpose = Column(String, nullable=False)
    withdrawn_amount = Column(Float, nullable=False)
    returned_amount = Column(Float, nullable=False, default=0.0)
    running_balance = Column(Float, nullable=False)
    category_tage = Column(String, nullable=False)
    payment_by = Column(String, nullable=False)
    created_by = Column(BigInteger, ForeignKey("tbl_users.id"), nullable=True)
    updated_by = Column(BigInteger, ForeignKey("tbl_users.id"), nullable=True)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now, nullable=False)

    # Relationships
    bills = relationship("ExpenseBill", back_populates="expense", cascade="all, delete-orphan")


class ExpenseBill(Base):
    """Expense bill model."""

    __tablename__ = "tbl_expenses_bills"

    id = Column(BigInteger, primary_key=True, index=True)
    expense_id = Column(BigInteger, ForeignKey("tbl_expenses.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False)
    bill_url = Column(String, nullable=False)

    # Relationships
    expense = relationship("Expense", back_populates="bills")


class FundDepositsBill(Base):
    """Fund deposit bill model."""

    __tablename__ = "tbl_deposits_bills"

    id = Column(BigInteger, primary_key=True, index=True)
    deposit_id = Column(BigInteger, ForeignKey("tbl_fund_deposits_history.id", onupdate="CASCADE"), nullable=False)
    bill_url = Column(String, nullable=False)
