"""Email utilities."""
import logging
import smtplib
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class SMTPConfig:
    """Resolved SMTP configuration for the active environment."""

    provider: str
    server: str
    port: int
    username: str
    password: str
    from_email: str


def _clean_env_value(value: str) -> str:
    """Normalize env values by trimming whitespace and wrapping quotes."""
    if value is None:
        return ""

    normalized = value.strip()
    if (
        len(normalized) >= 2
        and normalized[0] == normalized[-1]
        and normalized[0] in ('"', "'")
    ):
        normalized = normalized[1:-1].strip()

    return normalized


def _resolve_smtp_configs() -> list[SMTPConfig]:
    """Resolve SMTP configs in deterministic order: Zepto first, then SMTP fallback."""
    settings = get_settings()
    resolved_configs: list[SMTPConfig] = []

    zepto_username = _clean_env_value(settings.zepto_smtp_username)
    zepto_token = _clean_env_value(settings.zepto_api_token)
    zepto_from_email = _clean_env_value(settings.zepto_from_email)

    if zepto_username and zepto_token and zepto_from_email:
        resolved_configs.append(
            SMTPConfig(
                provider="zepto",
                server=_clean_env_value(settings.zepto_base_url),
                port=settings.zepto_smtp_port,
                username=zepto_username,
                password=zepto_token,
                from_email=zepto_from_email,
            )
        )

    smtp_username = _clean_env_value(settings.smtp_username)
    smtp_password = _clean_env_value(settings.smtp_password)
    sender_email = _clean_env_value(settings.sender_email)

    if smtp_username and smtp_password and sender_email:
        resolved_configs.append(
            SMTPConfig(
                provider="smtp",
                server=_clean_env_value(settings.smtp_server),
                port=settings.smtp_port,
                username=smtp_username,
                password=smtp_password,
                from_email=sender_email,
            )
        )

    return resolved_configs


def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """Send an email using SMTP."""
    smtp_configs = _resolve_smtp_configs()

    if not smtp_configs:
        print("Email configuration is missing. Set SMTP_* or ZEPTO_* values.")
        return False

    for smtp_config in smtp_configs:
        try:
            message = MIMEMultipart("alternative")
            message["Subject"] = subject
            message["From"] = smtp_config.from_email
            message["To"] = to_email

            part = MIMEText(html_content, "html")
            message.attach(part)

            with smtplib.SMTP(smtp_config.server, smtp_config.port, timeout=30) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(smtp_config.username, smtp_config.password)
                server.send_message(message)

            logger.info(
                "Email sent via provider=%s to=%s",
                smtp_config.provider,
                to_email,
            )
            return True
        except Exception as exc:
            logger.exception(
                "Email send failed via provider=%s to=%s error=%s",
                smtp_config.provider,
                to_email,
                str(exc),
            )

    return False


def send_password_reset_email(to_email: str, otp_code: str, app_url: str | None = None) -> bool:
    """Send OTP email for password reset."""
    subject = "Your Password Reset OTP"
    reset_link_html = ""
    if app_url:
        reset_link = f"{app_url}/reset-password"
        reset_link_html = f'<p>You can also reset from here: <a href="{reset_link}">{reset_link}</a></p>'

    html_content = f"""
    <html>
        <body>
            <p>Your OTP for password reset is:</p>
            <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">{otp_code}</p>
            <p>This OTP will expire in 1 hour.</p>
            {reset_link_html}
        </body>
    </html>
    """
    return send_email(to_email, subject, html_content)


def send_verification_email(to_email: str, verification_token: str, app_url: str) -> bool:
    """Send email verification email."""
    verify_link = f"{app_url}/verify-email?token={verification_token}"
    subject = "Verify Your Email"
    html_content = f"""
    <html>
        <body>
            <p>Click the link below to verify your email:</p>
            <a href="{verify_link}">Verify Email</a>
            <p>This link will expire in 24 hours.</p>
        </body>
    </html>
    """
    return send_email(to_email, subject, html_content)
