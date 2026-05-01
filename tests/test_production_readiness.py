from roster_system.config import Settings


def test_production_safety_validation_rejects_insecure_defaults() -> None:
    settings = Settings(
        app_env="production",
        database_url="sqlite:///./data/roster.db",
        allow_dev_tokens=True,
        jwt_secret="change-me-in-production",
        jwt_issuer=None,
        jwt_audience=None,
        cors_allowed_origins=["http://127.0.0.1:5173"],
        security_hsts_enabled=False,
    )

    try:
        settings.validate_production_safety()
        assert False, "Expected production safety validation to fail"
    except ValueError as exc:
        message = str(exc)
        assert "SQLite is not allowed" in message
        assert "ROSTER_ALLOW_DEV_TOKENS must be false" in message
        assert "ROSTER_JWT_SECRET" in message
        assert "ROSTER_JWT_ISSUER must be set" in message
        assert "ROSTER_JWT_AUDIENCE must be set" in message
        assert "localhost entries" in message
        assert "ROSTER_SECURITY_HSTS_ENABLED must be true" in message


def test_production_safety_validation_accepts_hardened_configuration() -> None:
    settings = Settings(
        app_env="production",
        database_url="postgresql+psycopg://user:pass@db-host/roster",
        allow_dev_tokens=False,
        jwt_secret="this-is-a-very-strong-secret-with-more-than-32-chars",
        jwt_issuer="https://idp.example.com/",
        jwt_audience="cas-rostering-api",
        cors_allowed_origins=["https://ops.example.com"],
        security_hsts_enabled=True,
    )
    settings.validate_production_safety()
