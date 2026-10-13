"""DateTime utilities."""
from datetime import datetime, timezone
import pytz


def get_utc_now() -> datetime:
    """Get current UTC datetime with timezone info."""
    return datetime.now(timezone.utc)


def to_utc(dt: datetime) -> datetime:
    """Convert datetime to UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def convert_to_utc(date_string: str, timezone_str: str) -> datetime:
    """
    Convert a date/datetime string in a given timezone to UTC.
    
    Args:
        date_string: ISO format date or datetime string (e.g., "2026-05-20" or "2026-05-20T14:30:00")
        timezone_str: IANA timezone string (e.g., "Asia/Kolkata", "America/New_York", "UTC")
    
    Returns:
        Naive UTC datetime (without timezone info) for database storage
    
    Raises:
        ValueError: If date_string or timezone_str is invalid
    """
    try:
        # Parse the date string
        parsed_dt = datetime.fromisoformat(date_string)
    except ValueError as exc:
        raise ValueError(f"Invalid date format. Use ISO date or datetime format: {date_string}") from exc
    
    try:
        # Get the timezone object
        tz = pytz.timezone(timezone_str)
    except pytz.exceptions.UnknownTimeZoneError as exc:
        raise ValueError(f"Invalid timezone: {timezone_str}") from exc
    
    # Localize the datetime to the given timezone
    if parsed_dt.tzinfo is None:
        localized_dt = tz.localize(parsed_dt)
    else:
        # If already has timezone, convert to the specified timezone first
        localized_dt = parsed_dt.astimezone(tz)
    
    # Convert to UTC and return as naive datetime (no timezone info)
    utc_dt = localized_dt.astimezone(pytz.UTC)
    return utc_dt.replace(tzinfo=None)
