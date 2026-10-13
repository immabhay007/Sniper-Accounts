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

        _engine = create_engine(
            settings.sqlalchemy_url,

            # validates connection before use
            pool_pre_ping=True,

            # recycle idle connections
            pool_recycle=1800,

            # pool settings
            pool_size=10,
            max_overflow=20,
            pool_timeout=30,

            # useful for debugging
            pool_reset_on_return="rollback",

            connect_args={
                "TrustServerCertificate": "yes",
                "timeout": 30,
            },
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
