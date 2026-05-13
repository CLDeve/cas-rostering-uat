from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from roster_system.api.dependencies import require_authenticated_user
from roster_system.api.routes.deployments import router as deployments_router
from roster_system.api.routes.dashboard import router as dashboard_router
from roster_system.api.routes.employees import router as employees_router
from roster_system.api.routes.roster import router as roster_router
from roster_system.api.routes.trainings import router as trainings_router
from roster_system.api.routes.users import router as users_router
from roster_system.config import settings
from roster_system.security_middleware import AuditLogMiddleware, RateLimitMiddleware, SecurityHeadersMiddleware
from roster_system.web.routes import router as web_router
from roster_system.db import engine


def _ensure_employee_deployment_area_column() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as connection:
        table_info = connection.execute(text("PRAGMA table_info(employees)")).fetchall()
        columns = {str(row[1]) for row in table_info}
        if "deployment_area" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE employees "
                    "ADD COLUMN deployment_area VARCHAR(32) NOT NULL DEFAULT 'UNASSIGNED'"
                )
            )
        if "terminal" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE employees "
                    "ADD COLUMN terminal VARCHAR(4) NULL"
                )
            )


def _ensure_roster_reporting_times_table() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE IF NOT EXISTS roster_reporting_times ("
                "id INTEGER PRIMARY KEY, "
                "employee_id INTEGER NOT NULL, "
                "shift_date DATE NOT NULL, "
                "reporting_time VARCHAR(5) NOT NULL, "
                "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                "FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE, "
                "UNIQUE(employee_id, shift_date)"
                ")"
            )
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.validate_production_safety()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    _ensure_employee_deployment_area_column()
    _ensure_roster_reporting_times_table()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allowed_methods,
    allow_headers=settings.cors_allowed_headers,
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AuditLogMiddleware)
app.include_router(employees_router, prefix=settings.api_prefix, dependencies=[Depends(require_authenticated_user)])
app.include_router(deployments_router, prefix=settings.api_prefix, dependencies=[Depends(require_authenticated_user)])
app.include_router(dashboard_router, prefix=settings.api_prefix, dependencies=[Depends(require_authenticated_user)])
app.include_router(roster_router, prefix=settings.api_prefix, dependencies=[Depends(require_authenticated_user)])
app.include_router(trainings_router, prefix=settings.api_prefix, dependencies=[Depends(require_authenticated_user)])
app.include_router(users_router, prefix=settings.api_prefix, dependencies=[Depends(require_authenticated_user)])
app.include_router(web_router)


@app.get("/", tags=["root"])
def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "status": "running",
        "docs": "/docs",
        "health": "/health",
        "react_app": "/app",
        "employees": f"{settings.api_prefix}/employees",
        "deployments": f"{settings.api_prefix}/deployments",
        "dashboard": f"{settings.api_prefix}/dashboard",
        "trainings": f"{settings.api_prefix}/trainings",
        "users": f"{settings.api_prefix}/users",
    }


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> Response:
    return Response(status_code=204)
