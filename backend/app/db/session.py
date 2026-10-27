"""Database session management and configuration."""
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import get_settings

Base = declarative_base()

_engine: Engine | None = None
_session_factory: sessionmaker | None = None


def get_engine() -> Engine:
    """Get or create SQLAlchemy engine singleton."""

    global _engine

    if _engine is None:
        settings = get_settings()
        url = settings.sqlalchemy_url
        is_mssql = url.drivername.startswith("mssql")

        common_kwargs = dict(
            pool_pre_ping=True,
            pool_recycle=1800,
            pool_size=10,
            max_overflow=20,
            pool_timeout=30,
            pool_reset_on_return="rollback",
        )

        if is_mssql:
            _engine = create_engine(
                url,
                **common_kwargs,
                connect_args={
                    "TrustServerCertificate": "yes",
                    "timeout": 30,
                },
            )
        else:
            # Postgres (Neon) — sslmode is already in the URL query string
            _engine = create_engine(
                url,
                **common_kwargs,
                connect_args={"connect_timeout": 30},
            )

    return _engine


def get_session_factory() -> sessionmaker:
    """Get or create session factory singleton."""
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            bind=get_engine(),
            autoflush=False,
            autocommit=False,
        )
    return _session_factory


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a database session."""
    db = get_session_factory()()
    try:
        yield db
    finally:
        db.close()
