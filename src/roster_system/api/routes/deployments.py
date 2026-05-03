from datetime import date
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Query, status

from roster_system.api.dependencies import get_deployment_service, require_planner_user
from roster_system.config import settings
from roster_system.schemas import (
    DeploymentAssignmentsRead,
    DeploymentAssignmentsUpsert,
    DeploymentSiteCreate,
    DeploymentSiteRead,
)
from roster_system.services.deployment_service import (
    DeploymentConflictError,
    DeploymentService,
    DeploymentValidationError,
)

router = APIRouter(prefix="/deployments", tags=["deployments"])


@router.post("", response_model=DeploymentSiteRead, status_code=status.HTTP_201_CREATED)
def create_deployment_site(
    payload: DeploymentSiteCreate,
    _: object = Depends(require_planner_user),
    service: DeploymentService = Depends(get_deployment_service),
) -> DeploymentSiteRead:
    try:
        return service.create_site(payload)
    except DeploymentConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("", response_model=list[DeploymentSiteRead])
def list_deployment_sites(
    service: DeploymentService = Depends(get_deployment_service),
) -> list[DeploymentSiteRead]:
    return service.list_sites()


@router.get("/door-4/flights")
def list_door_4_departure_flights(
    tixdate: date = Query(...),
    flightno: str | None = Query(default=None),
) -> Any:
    params = {"tixdate": tixdate.isoformat()}
    if flightno and flightno.strip():
        params["flightno"] = flightno.strip()

    url = f"{settings.cas_flights_base_url}?{urlencode(params)}"
    request = Request(url, headers={"x-api-key": settings.cas_flights_api_key, "Accept": "application/json"})

    try:
        with urlopen(request, timeout=settings.cas_flights_timeout_seconds) as response:
            raw_body = response.read().decode("utf-8")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") or exc.reason
        raise HTTPException(status_code=exc.code, detail=detail) from exc
    except URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Unable to reach CAS flight API: {exc.reason}",
        ) from exc

    try:
        return json.loads(raw_body)
    except json.JSONDecodeError:
        return {"raw": raw_body}


@router.get("/assignments", response_model=DeploymentAssignmentsRead)
def get_deployment_assignments(
    deployment_date: date = Query(...),
    service: DeploymentService = Depends(get_deployment_service),
) -> DeploymentAssignmentsRead:
    return service.list_assignments(deployment_date)


@router.put("/assignments", response_model=DeploymentAssignmentsRead)
def replace_deployment_assignments(
    payload: DeploymentAssignmentsUpsert,
    _: object = Depends(require_planner_user),
    service: DeploymentService = Depends(get_deployment_service),
) -> DeploymentAssignmentsRead:
    try:
        return service.replace_assignments(payload)
    except DeploymentValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
