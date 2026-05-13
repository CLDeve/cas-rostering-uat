from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from roster_system.api.dependencies import (
    get_db,
    require_admin_user,
    require_authenticated_user,
    require_planner_user,
)
from roster_system.config import settings
from roster_system.db import Base
from roster_system.main import app

TEST_DB_PATH = Path("/tmp/roster_system_test.db")
test_engine = create_engine(
    f"sqlite:///{TEST_DB_PATH}",
    connect_args={"check_same_thread": False},
)
TestSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)


def _get_test_db():
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


def pytest_runtest_setup() -> None:
    app.dependency_overrides[require_authenticated_user] = lambda: {"role": "ADMIN"}
    app.dependency_overrides[require_planner_user] = lambda: {"role": "ADMIN"}
    app.dependency_overrides[require_admin_user] = lambda: {"role": "ADMIN"}
    app.dependency_overrides[get_db] = _get_test_db

    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    upload_dir = Path(settings.upload_dir)
    if upload_dir.exists():
        for item in upload_dir.iterdir():
            if item.is_file():
                item.unlink()
