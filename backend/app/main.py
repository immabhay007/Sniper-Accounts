"""FastAPI application factory."""
import logging
from fastapi import FastAPI
from fastapi import Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.v1.router import router as v1_router
from app.core.config import get_settings
from app.db.session import get_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
    )

    # Configure CORS for all domains.
    # Note: wildcard origins cannot be combined with allow_credentials=True.
    logger.info("CORS: Allowing all origins (*)")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(v1_router, prefix="/api/v1")

    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "ok"}

    @app.get("/ready")
    async def readiness_check(db: Session = Depends(get_db)):
        """Readiness check endpoint with database connectivity verification."""
        logger.debug("Readiness check started: verifying database connectivity")
        try:
            db.execute(text("SELECT 1"))
            logger.debug("Readiness check passed: database connectivity verified")
            return {"ready": True}
        except SQLAlchemyError:
            logger.exception("Readiness check failed: database connectivity unavailable")
            raise HTTPException(status_code=503, detail="Database unavailable")

    return app


app = create_app()
