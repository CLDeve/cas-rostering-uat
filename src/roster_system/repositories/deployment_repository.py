from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from roster_system.models import DeploymentAssignment, DeploymentSite, Employee


class DeploymentRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, site: DeploymentSite) -> DeploymentSite:
        self.db.add(site)
        self.db.commit()
        self.db.refresh(site)
        return site

    def list_all(self) -> list[DeploymentSite]:
        stmt = select(DeploymentSite).order_by(DeploymentSite.site_name.asc())
        return list(self.db.scalars(stmt).all())

    def list_site_ids(self) -> set[int]:
        stmt = select(DeploymentSite.id)
        return set(self.db.scalars(stmt).all())

    def list_employee_ids(self) -> set[int]:
        stmt = select(Employee.id).where(Employee.is_active.is_(True))
        return set(self.db.scalars(stmt).all())

    def list_assignments_by_date(self, deployment_date: date) -> list[DeploymentAssignment]:
        stmt = (
            select(DeploymentAssignment)
            .where(DeploymentAssignment.deployment_date == deployment_date)
            .order_by(DeploymentAssignment.site_id.asc(), DeploymentAssignment.slot_index.asc())
        )
        return list(self.db.scalars(stmt).all())

    def replace_assignments_for_date(
        self,
        deployment_date: date,
        assignments: list[DeploymentAssignment],
    ) -> list[DeploymentAssignment]:
        self.db.execute(
            delete(DeploymentAssignment).where(DeploymentAssignment.deployment_date == deployment_date)
        )
        if assignments:
            self.db.add_all(assignments)
        self.db.commit()
        return self.list_assignments_by_date(deployment_date)
