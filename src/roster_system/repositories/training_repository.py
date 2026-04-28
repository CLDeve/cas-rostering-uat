from sqlalchemy import select
from sqlalchemy.orm import Session

from roster_system.models import TrainingCourse


class TrainingRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, course: TrainingCourse) -> TrainingCourse:
        self.db.add(course)
        self.db.commit()
        self.db.refresh(course)
        return course

    def list_all(self) -> list[TrainingCourse]:
        stmt = select(TrainingCourse).order_by(TrainingCourse.start_at.desc(), TrainingCourse.course_name.asc())
        return list(self.db.scalars(stmt).all())
