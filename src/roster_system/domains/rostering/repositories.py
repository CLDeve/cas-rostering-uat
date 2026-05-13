from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from roster_system.models import Employee, RosterOverride, RosterReportingTime


class EmployeeRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, employee: Employee) -> Employee:
        self.db.add(employee)
        self.db.commit()
        self.db.refresh(employee)
        return employee

    def get_by_id(self, employee_id: int) -> Employee | None:
        return self.db.get(Employee, employee_id)

    def get_by_staff_id(self, staff_id: str) -> Employee | None:
        stmt = select(Employee).where(Employee.staff_id == staff_id)
        return self.db.scalar(stmt)

    def get_max_serial_number(self) -> int:
        value = self.db.scalar(select(func.max(Employee.serial_number)))
        return int(value) if value is not None else 0

    def list_all_active(self) -> list[Employee]:
        stmt = (
            select(Employee)
            .where(Employee.is_active.is_(True))
            .order_by(Employee.serial_number.asc(), Employee.id.asc())
        )
        return list(self.db.scalars(stmt).all())

    def list_paginated(self, page: int, page_size: int, team: str | None, scheme: str | None) -> tuple[list[Employee], int]:
        stmt = select(Employee)
        count_stmt = select(func.count(Employee.id))

        if team:
            stmt = stmt.where(Employee.team == team)
            count_stmt = count_stmt.where(Employee.team == team)
        if scheme:
            stmt = stmt.where(Employee.scheme == scheme)
            count_stmt = count_stmt.where(Employee.scheme == scheme)

        stmt = stmt.order_by(Employee.id).offset((page - 1) * page_size).limit(page_size)

        items = list(self.db.scalars(stmt).all())
        total = self.db.scalar(count_stmt) or 0
        return items, total

    def update(self, employee: Employee) -> Employee:
        self.db.add(employee)
        self.db.commit()
        self.db.refresh(employee)
        return employee

    def delete(self, employee: Employee) -> None:
        self.db.delete(employee)
        self.db.commit()

    def list_roster_overrides(
        self,
        *,
        employee_ids: list[int],
        start_date: date,
        end_date: date,
    ) -> list[RosterOverride]:
        if not employee_ids:
            return []
        stmt = (
            select(RosterOverride)
            .where(RosterOverride.employee_id.in_(employee_ids))
            .where(RosterOverride.shift_date >= start_date)
            .where(RosterOverride.shift_date <= end_date)
        )
        return list(self.db.scalars(stmt).all())

    def replace_roster_overrides(
        self,
        *,
        employee_ids: list[int],
        start_date: date,
        end_date: date,
        new_overrides: list[RosterOverride],
    ) -> None:
        if employee_ids:
            existing = (
                self.db.query(RosterOverride)
                .filter(RosterOverride.employee_id.in_(employee_ids))
                .filter(RosterOverride.shift_date >= start_date)
                .filter(RosterOverride.shift_date <= end_date)
                .all()
            )
            for row in existing:
                self.db.delete(row)
        for row in new_overrides:
            self.db.add(row)
        self.db.commit()

    def list_reporting_times(
        self,
        *,
        employee_ids: list[int],
        start_date: date,
        end_date: date,
    ) -> list[RosterReportingTime]:
        if not employee_ids:
            return []
        stmt = (
            select(RosterReportingTime)
            .where(RosterReportingTime.employee_id.in_(employee_ids))
            .where(RosterReportingTime.shift_date >= start_date)
            .where(RosterReportingTime.shift_date <= end_date)
        )
        return list(self.db.scalars(stmt).all())

    def replace_reporting_times(
        self,
        *,
        employee_ids: list[int],
        start_date: date,
        end_date: date,
        new_rows: list[RosterReportingTime],
    ) -> None:
        if employee_ids:
            existing = (
                self.db.query(RosterReportingTime)
                .filter(RosterReportingTime.employee_id.in_(employee_ids))
                .filter(RosterReportingTime.shift_date >= start_date)
                .filter(RosterReportingTime.shift_date <= end_date)
                .all()
            )
            for row in existing:
                self.db.delete(row)
        for row in new_rows:
            self.db.add(row)
        self.db.commit()


__all__ = ["EmployeeRepository"]
