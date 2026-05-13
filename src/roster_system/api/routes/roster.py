from fastapi import APIRouter, Depends, HTTPException, Query, status

from roster_system.api.dependencies import get_employee_service, require_planner_user
from roster_system.domains.rostering.services import EmployeeConflictError, EmployeeNotFoundError, EmployeeService
from roster_system.schemas import RosterCalendarResponse, RosterCalendarSaveRequest, RosterCalendarSaveResponse
from roster_system.time_utils import today_sg

router = APIRouter(prefix="/roster", tags=["roster"])


@router.get("/calendar", response_model=RosterCalendarResponse)
def get_roster_calendar(
    year: int | None = Query(default=None, ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    service: EmployeeService = Depends(get_employee_service),
) -> RosterCalendarResponse:
    today = today_sg()
    return service.generate_roster_calendar(
        year=year if year is not None else today.year,
        month=month if month is not None else today.month,
    )


@router.put("/calendar", response_model=RosterCalendarSaveResponse)
def save_roster_calendar(
    payload: RosterCalendarSaveRequest,
    _: object = Depends(require_planner_user),
    service: EmployeeService = Depends(get_employee_service),
) -> RosterCalendarSaveResponse:
    try:
        return service.save_roster_calendar(payload)
    except EmployeeNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except EmployeeConflictError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
