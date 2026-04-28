from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse

router = APIRouter(tags=["web"])

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_REACT_DIST_DIR = _PROJECT_ROOT / "frontend" / "dist"
_REACT_INDEX_PATH = _REACT_DIST_DIR / "index.html"
_REACT_ASSETS_DIR = _REACT_DIST_DIR / "assets"


def _react_redirect(path: str) -> RedirectResponse:
    return RedirectResponse(url=f"/app{path}", status_code=307)


@router.get("/employees", include_in_schema=False)
def employees_page_redirect() -> RedirectResponse:
    return _react_redirect("/employees")


@router.get("/rostering-engine", include_in_schema=False)
def rostering_engine_page_redirect() -> RedirectResponse:
    return _react_redirect("/rostering-engine")


@router.get("/deployment-planning", include_in_schema=False)
def deployment_planning_page_redirect() -> RedirectResponse:
    return _react_redirect("/deployment-planning")


@router.get("/deployment-board", include_in_schema=False)
def deployment_board_page_redirect() -> RedirectResponse:
    return _react_redirect("/deployment-board")


@router.get("/deployment", include_in_schema=False)
def deployment_page_legacy_redirect() -> RedirectResponse:
    return _react_redirect("/deployment-planning")


@router.get("/rules", include_in_schema=False)
def rules_page_redirect() -> RedirectResponse:
    return _react_redirect("/rules")


@router.get("/training", include_in_schema=False)
def training_page_redirect() -> RedirectResponse:
    return _react_redirect("/training")


@router.get("/dashboard", include_in_schema=False)
def dashboard_page_redirect() -> RedirectResponse:
    return _react_redirect("/dashboard")


@router.get("/user-management", include_in_schema=False)
def user_management_page_redirect() -> RedirectResponse:
    return _react_redirect("/user-management")


@router.get("/app", include_in_schema=False)
@router.get("/app/{asset_path:path}", include_in_schema=False)
def react_app(asset_path: str = ""):
    """Serve React SPA build output when available."""
    if not _REACT_INDEX_PATH.exists():
        return HTMLResponse(
            content=(
                "<h2>React frontend is not built yet.</h2>"
                "<p>Run: <code>./scripts/frontend.sh install && ./scripts/frontend.sh run build</code></p>"
            ),
            status_code=503,
        )

    requested_path = (_REACT_DIST_DIR / asset_path).resolve() if asset_path else _REACT_INDEX_PATH.resolve()
    if asset_path and requested_path.is_file() and str(requested_path).startswith(str(_REACT_DIST_DIR.resolve())):
        return FileResponse(requested_path)

    return FileResponse(_REACT_INDEX_PATH)


@router.get("/assets/{asset_path:path}", include_in_schema=False)
def react_assets(asset_path: str):
    """Serve React built assets for absolute /assets/* references."""
    if not _REACT_ASSETS_DIR.exists():
        return HTMLResponse(status_code=404, content="Asset directory not found")

    requested_path = (_REACT_ASSETS_DIR / asset_path).resolve()
    if requested_path.is_file() and str(requested_path).startswith(str(_REACT_ASSETS_DIR.resolve())):
        return FileResponse(requested_path)

    return HTMLResponse(status_code=404, content="Asset not found")
