from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from roster_system.api.dependencies import get_deployment_service, require_planner_user
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
