from sqlalchemy.exc import IntegrityError

from roster_system.domains.training.repositories import TrainingRepository
from roster_system.models import TrainingCourse
from roster_system.schemas import TrainingCourseCreate, TrainingCourseRead


class TrainingConflictError(Exception):
    pass


class TrainingService:
    def __init__(self, repository: TrainingRepository):
        self.repository = repository

    def create_course(self, payload: TrainingCourseCreate) -> TrainingCourseRead:
        course = TrainingCourse(**payload.model_dump())
        try:
            created = self.repository.create(course)
            return TrainingCourseRead.model_validate(created)
        except IntegrityError as exc:
            self.repository.db.rollback()
            raise TrainingConflictError("same course name, start time, and location already exists") from exc

    def list_courses(self) -> list[TrainingCourseRead]:
        return [TrainingCourseRead.model_validate(course) for course in self.repository.list_all()]


__all__ = [
    "TrainingService",
    "TrainingConflictError",
]
