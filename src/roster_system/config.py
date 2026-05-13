from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
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
        "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    security_referrer_policy: str = "strict-origin-when-cross-origin"
    security_permissions_policy: str = "geolocation=(), microphone=(), camera=()"
    rate_limit_per_minute: int = 180
    cas_flights_base_url: str = "https://api.cas.certispsb.net/api-ext/v1/flights/arrival/list"
    cas_flights_api_key: str = "O9rLzAI7U16zbQrZksSne7RJ0C4cZGQv862CXEB4"
    cas_flights_timeout_seconds: float = 25.0
    openai_api_key: str | None = None
    openai_model: str = "gpt-5-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_timeout_seconds: float = 30.0

    def validate_production_safety(self) -> None:
        if self.app_env.lower() != "production":
            return

        errors: list[str] = []

        if self.database_url.startswith("sqlite"):
            errors.append("ROSTER_DATABASE_URL must use a production database (SQLite is not allowed in production).")

        if self.allow_dev_tokens:
            errors.append("ROSTER_ALLOW_DEV_TOKENS must be false in production.")

        secret = (self.jwt_secret or "").strip()
        if not secret or secret == "change-me-in-production" or len(secret) < 32:
            errors.append("ROSTER_JWT_SECRET must be set to a strong secret (>=32 chars) in production.")

        if not (self.jwt_issuer or "").strip():
            errors.append("ROSTER_JWT_ISSUER must be set in production.")
        if not (self.jwt_audience or "").strip():
            errors.append("ROSTER_JWT_AUDIENCE must be set in production.")

        localhost_origins = [o for o in self.cors_allowed_origins if "127.0.0.1" in o or "localhost" in o]
        if localhost_origins:
            errors.append("ROSTER_CORS_ALLOWED_ORIGINS contains localhost entries in production.")

        if not self.security_hsts_enabled:
            errors.append("ROSTER_SECURITY_HSTS_ENABLED must be true in production.")

        if errors:
            raise ValueError("Production safety checks failed: " + " ".join(errors))

    model_config = SettingsConfigDict(env_file=".env", env_prefix="ROSTER_")


settings = Settings()
