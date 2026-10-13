# Sniper FastAPI Backend

A FastAPI backend scaffolding with enterprise-grade patterns and conventions.

## Tech Stack

- **FastAPI**: 0.115.12
- **Uvicorn**: 0.34.0
- **SQLAlchemy**: 2.0.40
- **Alembic**: 1.15.2
- **Python-Jose**: 3.3.0 (JWT authentication)
- **Passlib + Bcrypt**: Password hashing
- **Pydantic Settings**: 2.8.1 (Configuration management)

## Project Structure

```
backend/
├── main.py                        # ASGI entry point
├── requirements.txt               # Python dependencies
├── alembic.ini                    # Alembic configuration
├── alembic/
│   ├── env.py                     # Alembic environment
│   └── versions/                  # Migration files (auto-generated)
└── app/
    ├── __init__.py
    ├── main.py                    # FastAPI app factory
    ├── api/
    │   └── v1/
    │       ├── router.py          # Main router
    │       └── endpoints/
    │           └── auth.py        # Authentication endpoints
    ├── core/
    │   ├── config.py              # Settings management
    │   ├── security.py            # JWT & password utilities
    │   ├── deps.py                # FastAPI dependencies
    │   ├── datetime_utils.py      # DateTime utilities
    │   └── email_utils.py         # Email utilities
    ├── db/
    │   └── session.py             # Database session management
    ├── models/
    │   └── models.py              # SQLAlchemy ORM models
    ├── schemas/
    │   └── schemas.py             # Pydantic schemas
    ├── services/                  # Business logic layer
    └── templates/                 # Email/document templates
```

## Setup Instructions

### 1. Create Virtual Environment

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

Copy `.env.example` to `.env` and update with your values:

```bash
cp .env.example .env
```

Required environment variables:
- `DB_SERVER`: SQL Server hostname
- `DB_NAME`: Database name
- `DB_USER`: Database username
- `DB_PASSWORD`: Database password
- `SECRET_KEY`: JWT secret key (generate a strong one)

### 4. Create Database and Run Migrations

```bash
# Create initial migration (if needed)
alembic revision --autogenerate -m "Initial migration"

# Run migrations
alembic upgrade head
```

### 5. Run Development Server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

API docs: `http://localhost:8000/docs`

## Database

- **Type**: Microsoft SQL Server
- **Driver**: ODBC Driver 18 for SQL Server
- **Connection**: Uses lazy singleton pattern for engine and session factory
- **Pool**: Pre-ping enabled for connection health checks
- **SSL**: TrustServerCertificate=yes (configured for development)

## Authentication

Full JWT-based authentication system:
- User registration with email verification
- Login/logout with access and refresh tokens
- Password reset via OTP
- Change password endpoint
- Email verification

### Auth Endpoints

- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `POST /api/v1/auth/password-reset-request` - Request password reset
- `POST /api/v1/auth/password-reset-confirm` - Confirm password reset
- `POST /api/v1/auth/change-password` - Change password (requires auth)
- `POST /api/v1/auth/verify-email` - Verify email address
- `GET /api/v1/auth/me` - Get current user (requires auth)

## Architecture Patterns

### Configuration
- Centralized settings via `pydantic-settings`
- Environment variable management
- Singleton pattern for settings

### Database
- Lazy initialization pattern for engine/session factory
- Clean dependency injection with FastAPI `Depends()`
- Automatic connection closing via generator pattern

### Security
- Bcrypt password hashing
- JWT tokens (access + refresh)
- Token expiration management
- User role/permission extensible design

### Error Handling
- Consistent HTTP exception responses
- Validation via Pydantic schemas
- Meaningful error messages

## Running Tests

```bash
# Install test dependencies (to be added)
pytest

# With coverage
pytest --cov=app
```

## Production Deployment

1. Install dependencies: `pip install -r requirements.txt`
2. Run migrations: `alembic upgrade head`
3. Start with Gunicorn:
   ```bash
   gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker
   ```

### Azure App Service (Linux) Notes

- Do not deploy a prebuilt virtual environment archive from another OS/image.
- Enable remote build so dependencies are built in the App Service Linux environment.
- Set app setting `SCM_DO_BUILD_DURING_DEPLOYMENT=true`.
- Set startup command:
    ```bash
    python -m gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000 --timeout 600 --access-logfile '-' --error-logfile '-'
    ```

## Adding New Endpoints

1. Create new endpoint file in `app/api/v1/endpoints/`
2. Create router in that file
3. Include router in `app/api/v1/router.py`
4. Add request/response schemas in `app/schemas/schemas.py`
5. Add database models in `app/models/models.py` if needed

## Notes

- This is a skeleton/foundation project
- Business logic and additional tables/endpoints will be added separately
- All passwords are hashed with bcrypt before storage
- JWT tokens use HS256 algorithm
- Email functionality requires SMTP configuration
