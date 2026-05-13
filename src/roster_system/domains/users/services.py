from sqlalchemy.exc import IntegrityError

from roster_system.domains.users.repositories import UserRepository
from roster_system.models import UserAccount
from roster_system.schemas import UserAccountCreate, UserAccountRead


class UserConflictError(Exception):
    pass


class UserNotFoundError(Exception):
    pass


class UserService:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    def create_user(self, payload: UserAccountCreate) -> UserAccountRead:
        if self.repository.get_by_staff_id(payload.staff_id):
            raise UserConflictError("staff_id already exists")
        user_data = payload.model_dump()
        username = user_data.get("username", "").strip().lower()
        user_data["email"] = f"{username}@local.invalid"
        user = UserAccount(**user_data)
        try:
            created = self.repository.create(user)
            return UserAccountRead.model_validate(created)
        except IntegrityError as exc:
            self.repository.db.rollback()
            raise UserConflictError("username or staff_id already exists") from exc

    def list_users(self) -> list[UserAccountRead]:
        return [UserAccountRead.model_validate(user) for user in self.repository.list_all()]

    def update_status(self, user_id: int, *, is_active: bool) -> UserAccountRead:
        existing = self.repository.get_by_id(user_id)
        if existing is None:
            raise UserNotFoundError("user not found")
        updated = self.repository.update_status(existing, is_active=is_active)
        return UserAccountRead.model_validate(updated)


__all__ = [
    "UserService",
    "UserConflictError",
    "UserNotFoundError",
]
