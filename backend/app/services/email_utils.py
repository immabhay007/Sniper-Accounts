
import httpx
import os

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
FRONTEND_RESET_URL = os.getenv("FRONTEND_RESET_URL")


async def send_password_reset_email(
    to_email: str,
    token: str,
):
    reset_link = (
        f"{FRONTEND_RESET_URL}?token={token}"
    )

    subject = "Reset your password"

    html = f"""
    <p>Hello,</p>

    <p>
        You requested a password reset.
    </p>

    <p>
        Click below to reset your password:
    </p>

    <p>
        <a href="{reset_link}">
            Reset Password
        </a>
    </p>

    <p>
        This link is valid for 15 minutes.
    </p>

    <p>
        If you did not request this,
        you can ignore this email.
    </p>
    """

    payload = {
        "from": "onboarding@resend.dev",
        "to": [to_email],
        "subject": subject,
        "html": html,
    }

    headers = {
        "Authorization": (
            f"Bearer {RESEND_API_KEY}"
        ),
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.resend.com/emails",
            json=payload,
            headers=headers,
        )

        response.raise_for_status()