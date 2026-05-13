from fastapi import APIRouter, Depends, HTTPException, status

from roster_system.api.dependencies import get_user_service, require_admin_user
from roster_system.domains.users.services import UserConflictError, UserNotFoundError, UserService
from roster_system.schemas import UserAccountCreate, UserAccountRead, UserAccountStatusUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserAccountRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserAccountCreate,
    _: object = Depends(require_admin_user),
    service: UserService = Depends(get_user_service),
) -> UserAccountRead:
    try:
        return service.create_user(payload)
    except UserConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("", response_model=list[UserAccountRead])
def list_users(
    _: object = Depends(require_admin_user),
    service: UserService = Depends(get_user_service),
) -> list[UserAccountRead]:
    return service.list_users()


@router.put("/{user_id}/status", response_model=UserAccountRead)
def update_user_status(
    user_id: int,
    payload: UserAccountStatusUpdate,
    _: object = Depends(require_admin_user),
    service: UserService = Depends(get_user_service),
) -> UserAccountRead:
    try:
        return service.update_status(user_id, is_active=payload.is_active)
    except UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
