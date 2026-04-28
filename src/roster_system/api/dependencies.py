from fastapi import Depends
from sqlalchemy.orm import Session

from roster_system.api.security import AuthIdentity, require_roles
from roster_system.db import get_db_session
from roster_system.repositories.deployment_repository import DeploymentRepository
from roster_system.repositories.employee_repository import EmployeeRepository
from roster_system.repositories.training_repository import TrainingRepository
from roster_system.repositories.user_repository import UserRepository
from roster_system.services.deployment_service import DeploymentService
from roster_system.services.employee_service import EmployeeService
from roster_system.services.training_service import TrainingService
from roster_system.services.user_service import UserService
from roster_system.schemas import UserRole


def get_db() -> Session:
    yield from get_db_session()


def get_employee_service(db: Session = Depends(get_db)) -> EmployeeService:
    repository = EmployeeRepository(db)
    return EmployeeService(repository)


def get_deployment_service(db: Session = Depends(get_db)) -> DeploymentService:
    repository = DeploymentRepository(db)
    return DeploymentService(repository)


def get_training_service(db: Session = Depends(get_db)) -> TrainingService:
    repository = TrainingRepository(db)
    return TrainingService(repository)


def get_user_service(db: Session = Depends(get_db)) -> UserService:
    repository = UserRepository(db)
    return UserService(repository)


def require_authenticated_user(identity: AuthIdentity = Depends(require_roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.VIEWER))) -> AuthIdentity:
    return identity


def require_planner_user(identity: AuthIdentity = Depends(require_roles(UserRole.ADMIN, UserRole.PLANNER))) -> AuthIdentity:
    return identity


def require_admin_user(identity: AuthIdentity = Depends(require_roles(UserRole.ADMIN))) -> AuthIdentity:
    return identity
