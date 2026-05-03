from datetime import date
from http.client import HTTPSConnection, HTTPException as HttpClientException
import json
from typing import Any
from urllib.parse import urlencode
from urllib.parse import urlparse

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

    parsed_url = urlparse(settings.cas_flights_base_url)
    path = f"{parsed_url.path}?{urlencode(params)}"

    try:
        connection = HTTPSConnection(parsed_url.netloc, timeout=settings.cas_flights_timeout_seconds)
        connection.request(
            "GET",
            path,
            headers={"x-api-key": settings.cas_flights_api_key, "Accept": "application/json"},
        )
        response = connection.getresponse()
        raw_body = response.read().decode("utf-8")
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Unable to reach CAS flight API: {exc}",
        ) from exc
    except HttpClientException as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"CAS flight API request failed: {exc}",
        ) from exc
    finally:
        if "connection" in locals():
            connection.close()

    if response.status >= 400:
        raise HTTPException(status_code=response.status, detail=raw_body or response.reason)

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
