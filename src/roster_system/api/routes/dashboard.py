from datetime import date

from fastapi import APIRouter, Depends, Query

from roster_system.api.dependencies import get_deployment_service
from roster_system.domains.deployment.services import DeploymentService
from roster_system.schemas import DeploymentCoverageCalendarRead, DeploymentCoverageDay

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/coverage", response_model=DeploymentCoverageDay)
def get_daily_coverage(
    target_date: date = Query(..., alias="date"),
    service: DeploymentService = Depends(get_deployment_service),
) -> DeploymentCoverageDay:
    return service.get_daily_coverage(target_date)


@router.get("/coverage-calendar", response_model=DeploymentCoverageCalendarRead)
def get_monthly_coverage(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    service: DeploymentService = Depends(get_deployment_service),
) -> DeploymentCoverageCalendarRead:
    return service.get_monthly_coverage(year, month)
