from sqlalchemy import select
from sqlalchemy.orm import Session

from roster_system.models import UserAccount


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, user: UserAccount) -> UserAccount:
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def list_all(self) -> list[UserAccount]:
        stmt = select(UserAccount).order_by(UserAccount.created_at.desc(), UserAccount.username.asc())
        return list(self.db.scalars(stmt).all())

    def get_by_id(self, user_id: int) -> UserAccount | None:
        stmt = select(UserAccount).where(UserAccount.id == user_id)
        return self.db.scalar(stmt)

    def get_by_staff_id(self, staff_id: str) -> UserAccount | None:
        stmt = select(UserAccount).where(UserAccount.staff_id == staff_id)
        return self.db.scalar(stmt)

    def update_status(self, user: UserAccount, *, is_active: bool) -> UserAccount:
        user.is_active = is_active
        self.db.commit()
        self.db.refresh(user)
        return user
