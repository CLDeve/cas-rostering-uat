from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Roster System"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./data/roster.db"
    upload_dir: str = "./data/uploads"
    allow_dev_tokens: bool = False
    api_tokens: dict[str, str] = Field(
        default_factory=lambda: {
            "dev-admin-token": "ADMIN",
            "dev-planner-token": "PLANNER",
            "dev-viewer-token": "VIEWER",
        }
    )
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str | None = None
    jwt_audience: str | None = None

    cors_allowed_origins: list[str] = Field(default_factory=lambda: ["http://127.0.0.1:8000", "http://127.0.0.1:5173"])
    cors_allow_credentials: bool = False
    cors_allowed_methods: list[str] = Field(default_factory=lambda: ["GET", "POST", "PUT", "DELETE", "OPTIONS"])
    cors_allowed_headers: list[str] = Field(default_factory=lambda: ["Authorization", "Content-Type", "Accept"])

    security_hsts_enabled: bool = False
    security_csp: str = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    security_referrer_policy: str = "strict-origin-when-cross-origin"
    security_permissions_policy: str = "geolocation=(), microphone=(), camera=()"
    rate_limit_per_minute: int = 180

    model_config = SettingsConfigDict(env_file=".env", env_prefix="ROSTER_")


settings = Settings()
