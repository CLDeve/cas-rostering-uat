from pathlib import Path

from roster_system.api.dependencies import (
    require_admin_user,
    require_authenticated_user,
    require_planner_user,
)
from roster_system.config import settings
from roster_system.db import Base, engine
from roster_system.main import app


def pytest_runtest_setup() -> None:
    app.dependency_overrides[require_authenticated_user] = lambda: {"role": "ADMIN"}
    app.dependency_overrides[require_planner_user] = lambda: {"role": "ADMIN"}
    app.dependency_overrides[require_admin_user] = lambda: {"role": "ADMIN"}

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    upload_dir = Path(settings.upload_dir)
    if upload_dir.exists():
        for item in upload_dir.iterdir():
            if item.is_file():
                item.unlink()
