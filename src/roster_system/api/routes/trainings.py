from fastapi import APIRouter, Depends, HTTPException, status

from roster_system.api.dependencies import get_training_service, require_planner_user
from roster_system.schemas import TrainingCourseCreate, TrainingCourseRead
from roster_system.services.training_service import TrainingConflictError, TrainingService

router = APIRouter(prefix="/trainings", tags=["trainings"])


@router.post("", response_model=TrainingCourseRead, status_code=status.HTTP_201_CREATED)
def create_training_course(
    payload: TrainingCourseCreate,
    _: object = Depends(require_planner_user),
    service: TrainingService = Depends(get_training_service),
) -> TrainingCourseRead:
    try:
        return service.create_course(payload)
    except TrainingConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("", response_model=list[TrainingCourseRead])
def list_training_courses(
    service: TrainingService = Depends(get_training_service),
) -> list[TrainingCourseRead]:
    return service.list_courses()
