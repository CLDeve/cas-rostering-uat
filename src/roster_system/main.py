from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

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


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.validate_production_safety()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
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
