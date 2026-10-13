import os
from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


# Project root directory
BASE_DIR = Path(__file__).resolve().parents[2]

# Read ENV variable
ENV_NAME = os.getenv("ENV", "develop").lower()

print("=" * 60)
print("ENV_NAME =", ENV_NAME)

# Select env file
PREFERRED_ENV_FILE = (
    ".env.prod"
    if ENV_NAME in ["prod", "production"]
    else ".env.develop"
)

# Final env file path
if (BASE_DIR / PREFERRED_ENV_FILE).exists():
    ENV_FILE_PATH = BASE_DIR / PREFERRED_ENV_FILE
else:
    ENV_FILE_PATH = BASE_DIR / ".env"

print("PREFERRED_ENV_FILE =", PREFERRED_ENV_FILE)
print("ENV_FILE_PATH =", ENV_FILE_PATH)
print("ENV FILE EXISTS =", ENV_FILE_PATH.exists())
print("=" * 60)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database Configuration
    db_server: str
    db_name: str
    db_user: str
    db_password: str
    db_driver: str = "ODBC Driver 18 for SQL Server"

    # JWT/Security Configuration
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Email Configuration
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    sender_email: str = ""

    # Zepto Mail Configuration
    zepto_base_url: str = "smtp.zeptomail.in"
    zepto_smtp_port: int = 587
    zepto_smtp_username: str = ""
    zepto_api_token: str = ""
    zepto_from_email: str = ""
    zepto_from_name: str = "sniper Team"

    # Azure Storage Configuration
    azure_storage_account_name: str = ""
    azure_storage_account_key: str = ""
    azure_storage_container_name: str = "sniper-account-bills"
    azure_storage_connection_string: str = ""
    azure_storage_base_url: str = ""

    # Application Configuration
    app_name: str = "sniper API"
    debug: bool = False
    cors_origins: str = "*"
    frontend_reset_url: str = "http://localhost:3000"

    # Pydantic settings config
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE_PATH),
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        origins = self.cors_origins.strip()

        if origins == "*":
            return ["*"]

        return [o.strip() for o in origins.split(",") if o.strip()]

    @property
    def sqlalchemy_url(self) -> URL:
        print("=" * 60)
        print("ACTIVE DATABASE CONFIGURATION")
        print("DB_SERVER =", self.db_server)
        print("DB_NAME   =", self.db_name)
        print("DB_USER   =", self.db_user)
        print("DB_DRIVER =", self.db_driver)
        print("=" * 60)

        return URL.create(
            drivername="mssql+pyodbc",
            username=self.db_user,
            password=self.db_password,
            host=self.db_server,
            database=self.db_name,
            query={
                "driver": self.db_driver,
                "TrustServerCertificate": "yes",
            },
        )


@lru_cache
def get_settings() -> Settings:
    print("Loading application settings...")

    settings = Settings()

    print("=" * 60)
    print("SETTINGS LOADED SUCCESSFULLY")
    print("DB_SERVER =", settings.db_server)
    print("DB_NAME   =", settings.db_name)
    print("=" * 60)

    return settings