from calendar import day_abbr, monthrange, weekday
from datetime import date
from decimal import Decimal
from pathlib import Path
import re
from uuid import uuid4

from sqlalchemy.exc import IntegrityError

from roster_system.config import settings
from roster_system.domains.rostering.repositories import EmployeeRepository
from roster_system.domains.rostering.shift_logic import build_shift_plan, pattern_cycle_length
from roster_system.importers import ImportedEmployeeRow
from roster_system.models import Employee, RosterOverride, RosterReportingTime, UploadFileRecord
from roster_system.schemas import (
    EmployeeCreate,
    EmployeeImportResult,
    EmployeeUpdate,
    PaginatedEmployees,
    RosterCalendarDay,
    RosterCalendarEmployeeRow,
    RosterCalendarResponse,
    RosterCalendarSaveRequest,
    RosterCalendarSaveResponse,
    ShiftPlanResponse,
    UploadFileRead,
)


class EmployeeConflictError(Exception):
    pass


class EmployeeNotFoundError(Exception):
    pass


STATUS_HOURS = {
    "WORK": 13,
    "OFF": 0,
    "OT1": 5,
    "OT2": 13,
    "EMPTY": 0,
}
WORKING_STATUSES = {"WORK", "OT1", "OT2"}
REPORTING_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class EmployeeService:
    def __init__(self, repository: EmployeeRepository):
        self.repository = repository

    def _next_serial_number(self) -> int:
        return self.repository.get_max_serial_number() + 1

    def create_employee(self, payload: EmployeeCreate) -> Employee:
        data = payload.model_dump()
        shift_patterns = data.pop("shift_patterns", None) or []
        if data.get("serial_number") is None:
            data["serial_number"] = self._next_serial_number()
        if data.get("forecast_hours") is None:
            data["forecast_hours"] = data["contractual_hours"]
        employee = Employee(**data)
        employee.shift_patterns = shift_patterns if shift_patterns else [employee.shift_pattern]
        try:
            return self.repository.create(employee)
        except IntegrityError as exc:
            self.repository.db.rollback()
            raise EmployeeConflictError("staff_id already exists") from exc

    def list_employees(self, page: int, page_size: int, team: str | None, scheme: str | None) -> PaginatedEmployees:
        items, total = self.repository.list_paginated(page=page, page_size=page_size, team=team, scheme=scheme)
        return PaginatedEmployees(items=items, total=total, page=page, page_size=page_size)

    def get_employee(self, employee_id: int) -> Employee:
        employee = self.repository.get_by_id(employee_id)
        if not employee:
            raise EmployeeNotFoundError("employee not found")
        return employee

    def update_employee(self, employee_id: int, payload: EmployeeUpdate) -> Employee:
        employee = self.get_employee(employee_id)
        data = payload.model_dump(exclude_unset=True)
        shift_patterns = data.pop("shift_patterns", None)
        for field, value in data.items():
            setattr(employee, field, value)
        if shift_patterns is not None:
            employee.shift_patterns = shift_patterns

        try:
            return self.repository.update(employee)
        except IntegrityError as exc:
            self.repository.db.rollback()
            raise EmployeeConflictError("duplicate or invalid update") from exc

    def delete_employee(self, employee_id: int) -> None:
        employee = self.get_employee(employee_id)
        self.repository.delete(employee)

    def get_shift_plan(self, employee_id: int, days: int, start_offset: int) -> ShiftPlanResponse:
        employee = self.get_employee(employee_id)
        return build_shift_plan(
            employee_id=employee.id,
            shift_pattern=employee.shift_pattern,
            days=days,
            start_offset=start_offset,
        )

    def _build_base_schedule_for_employee(self, employee: Employee, year: int, month: int) -> list[str]:
        days_in_month = monthrange(year, month)[1]
        cycle_len = pattern_cycle_length(employee.shift_pattern)
        schedule: list[str] = []

        if employee.start_date:
            for day in range(1, days_in_month + 1):
                current_date = date(year, month, day)
                if current_date < employee.start_date:
                    schedule.append("EMPTY")
                    continue
                start_offset = (current_date - employee.start_date).days % cycle_len
                day_plan = build_shift_plan(
                    employee_id=employee.id,
                    shift_pattern=employee.shift_pattern,
                    days=1,
                    start_offset=start_offset,
                )
                schedule.append(day_plan.plan[0].status)
            return schedule

        start_offset = (employee.serial_number - 1) % cycle_len
        plan = build_shift_plan(
            employee_id=employee.id,
            shift_pattern=employee.shift_pattern,
            days=days_in_month,
            start_offset=start_offset,
        )
        return [entry.status for entry in plan.plan]

    @staticmethod
    def _exceeds_max_consecutive_working_days(schedule: list[str], max_days: int = 12) -> bool:
        streak = 0
        for status in schedule:
            if status in WORKING_STATUSES:
                streak += 1
                if streak > max_days:
                    return True
            else:
                streak = 0
        return False

    def generate_roster_calendar(self, year: int, month: int) -> RosterCalendarResponse:
        days_in_month = monthrange(year, month)[1]
        month_start = date(year, month, 1)
        month_end = date(year, month, days_in_month)
        day_headers = [
            RosterCalendarDay(day=day, weekday=day_abbr[weekday(year, month, day)])
            for day in range(1, days_in_month + 1)
        ]

        employees = self.repository.list_all_active()
        employee_ids = [employee.id for employee in employees]
        raw_overrides = self.repository.list_roster_overrides(
            employee_ids=employee_ids,
            start_date=month_start,
            end_date=month_end,
        )
        overrides_by_employee_date: dict[tuple[int, date], str] = {
            (row.employee_id, row.shift_date): row.status for row in raw_overrides
        }
        raw_reporting_times = self.repository.list_reporting_times(
            employee_ids=employee_ids,
            start_date=month_start,
            end_date=month_end,
        )
        reporting_time_by_employee_date: dict[tuple[int, date], str] = {
            (row.employee_id, row.shift_date): row.reporting_time for row in raw_reporting_times
        }
        roster_rows: list[RosterCalendarEmployeeRow] = []

        for employee in employees:
            base_schedule = self._build_base_schedule_for_employee(employee, year, month)
            schedule: list[str] = []
            for day in range(1, days_in_month + 1):
                current_date = date(year, month, day)
                default_status = base_schedule[day - 1]
                override_status = overrides_by_employee_date.get((employee.id, current_date))
                schedule.append(override_status if override_status is not None else default_status)
            reporting_times = [
                reporting_time_by_employee_date.get((employee.id, date(year, month, day)))
                for day in range(1, days_in_month + 1)
            ]

            forecast_hours = sum(STATUS_HOURS.get(shift, 0) for shift in schedule)

            roster_rows.append(
                RosterCalendarEmployeeRow(
                    employee_id=employee.id,
                    serial_number=employee.serial_number,
                    staff_id=employee.staff_id,
                    name=employee.name,
                    team=employee.team,
                    shift_pattern=employee.shift_pattern,
                    reporting_times=reporting_times,
                    schedule=schedule,
                    forecast_hours=forecast_hours,
                )
            )

        return RosterCalendarResponse(
            year=year,
            month=month,
            days_in_month=days_in_month,
            day_headers=day_headers,
            employees=roster_rows,
        )

    def save_roster_calendar(self, payload: RosterCalendarSaveRequest) -> RosterCalendarSaveResponse:
        year = payload.year
        month = payload.month
        days_in_month = monthrange(year, month)[1]
        month_start = date(year, month, 1)
        month_end = date(year, month, days_in_month)

        if not payload.employees:
            return RosterCalendarSaveResponse(
                year=year,
                month=month,
                employees_saved=0,
                overrides_saved=0,
            )

        employee_ids = [row.employee_id for row in payload.employees]
        overrides_to_save: list[RosterOverride] = []
        reporting_times_to_save: list[RosterReportingTime] = []

        for row in payload.employees:
            employee = self.repository.get_by_id(row.employee_id)
            if employee is None or not employee.is_active:
                raise EmployeeNotFoundError(f"employee not found: {row.employee_id}")

            if len(row.schedule) != days_in_month:
                raise EmployeeConflictError(
                    f"schedule length for employee {row.employee_id} must be {days_in_month} days"
                )
            if row.reporting_times and len(row.reporting_times) != days_in_month:
                raise EmployeeConflictError(
                    f"reporting_times length for employee {row.employee_id} must be {days_in_month} days"
                )

            base_schedule = self._build_base_schedule_for_employee(employee, year, month)
            normalized_schedule = [status.upper() for status in row.schedule]

            for idx, status in enumerate(normalized_schedule):
                default_status = base_schedule[idx]
                if default_status == "EMPTY" and status != "EMPTY":
                    day = idx + 1
                    raise EmployeeConflictError(
                        f"employee {row.employee_id} day {day} is before start date and cannot be changed"
                    )

            if self._exceeds_max_consecutive_working_days(normalized_schedule, 12):
                raise EmployeeConflictError(
                    f"employee {row.employee_id} exceeds 12 consecutive working days"
                )

            for idx, status in enumerate(normalized_schedule):
                current_date = date(year, month, idx + 1)
                default_status = base_schedule[idx]
                if status in {"EMPTY"}:
                    continue
                if status != default_status:
                    overrides_to_save.append(
                        RosterOverride(
                            employee_id=row.employee_id,
                            shift_date=current_date,
                            status=status,
                        )
                    )
            normalized_reporting = row.reporting_times if row.reporting_times else [None] * days_in_month
            for idx, value in enumerate(normalized_reporting):
                if value is None:
                    continue
                reporting_time = str(value).strip()
                if not reporting_time:
                    continue
                if not REPORTING_TIME_RE.match(reporting_time):
                    raise EmployeeConflictError(
                        f"invalid reporting_time for employee {row.employee_id}: {reporting_time} (use HH:MM)"
                    )
                current_date = date(year, month, idx + 1)
                reporting_times_to_save.append(
                    RosterReportingTime(
                        employee_id=row.employee_id,
                        shift_date=current_date,
                        reporting_time=reporting_time,
                    )
                )

        self.repository.replace_roster_overrides(
            employee_ids=employee_ids,
            start_date=month_start,
            end_date=month_end,
            new_overrides=overrides_to_save,
        )
        self.repository.replace_reporting_times(
            employee_ids=employee_ids,
            start_date=month_start,
            end_date=month_end,
            new_rows=reporting_times_to_save,
        )

        return RosterCalendarSaveResponse(
            year=year,
            month=month,
            employees_saved=len(payload.employees),
            overrides_saved=len(overrides_to_save),
        )

    def import_employees(self, rows: list[ImportedEmployeeRow], sheet_name: str) -> EmployeeImportResult:
        created = 0
        updated = 0
        next_serial = self._next_serial_number()

        for row in rows:
            employee = self.repository.get_by_staff_id(row.staff_id)
            if employee is None:
                serial_number = row.serial_number if row.serial_number is not None else next_serial
                if row.serial_number is None:
                    next_serial += 1
                new_employee = Employee(
                    serial_number=serial_number,
                    team=row.team,
                    deployment_area=row.deployment_area,
                    rank=row.rank,
                    staff_id=row.staff_id,
                    name=row.name,
                    start_date=row.start_date,
                    gender=row.gender,
                    terminal=row.terminal,
                    cert=row.cert,
                    scheme=row.scheme,
                    shift_pattern=row.shift_pattern,
                    contractual_hours=Decimal(row.contractual_hours),
                    forecast_hours=Decimal(row.forecast_hours),
                    is_active=True,
                )
                new_employee.shift_patterns = [row.shift_pattern]
                self.repository.db.add(new_employee)
                created += 1
                continue

            if row.serial_number is not None:
                employee.serial_number = row.serial_number
            employee.team = row.team
            employee.deployment_area = row.deployment_area
            employee.rank = row.rank
            employee.name = row.name
            employee.start_date = row.start_date
            employee.gender = row.gender
            employee.terminal = row.terminal
            employee.cert = row.cert
            employee.scheme = row.scheme
            employee.shift_pattern = row.shift_pattern
            employee.shift_patterns = [row.shift_pattern]
            employee.contractual_hours = Decimal(row.contractual_hours)
            employee.forecast_hours = Decimal(row.forecast_hours)
            employee.is_active = True
            self.repository.db.add(employee)
            updated += 1

        try:
            self.repository.db.commit()
        except IntegrityError as exc:
            self.repository.db.rollback()
            raise EmployeeConflictError("Failed to import rows due to data conflict") from exc

        return EmployeeImportResult(
            created=created,
            updated=updated,
            total_processed=created + updated,
            sheet_name=sheet_name,
        )

    def save_uploaded_file(
        self,
        *,
        file_bytes: bytes,
        original_filename: str,
        content_type: str | None,
        sheet_name: str,
    ) -> UploadFileRecord:
        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)

        extension = Path(original_filename).suffix.lower() or ".xlsx"
        stored_filename = f"{uuid4().hex}{extension}"
        target_path = upload_dir / stored_filename
        target_path.write_bytes(file_bytes)

        record = UploadFileRecord(
            original_filename=original_filename,
            stored_filename=stored_filename,
            content_type=content_type,
            sheet_name=sheet_name,
            file_size_bytes=len(file_bytes),
        )
        self.repository.db.add(record)
        self.repository.db.commit()
        self.repository.db.refresh(record)
        return record

    def get_latest_upload(self) -> UploadFileRecord:
        record = (
            self.repository.db.query(UploadFileRecord)
            .order_by(UploadFileRecord.created_at.desc(), UploadFileRecord.id.desc())
            .first()
        )
        if not record:
            raise EmployeeNotFoundError("no uploaded file found")
        return record

    def get_upload(self, upload_file_id: int) -> UploadFileRecord:
        record = self.repository.db.get(UploadFileRecord, upload_file_id)
        if not record:
            raise EmployeeNotFoundError("uploaded file not found")
        return record

    def get_upload_path(self, record: UploadFileRecord) -> Path:
        path = Path(settings.upload_dir) / record.stored_filename
        if not path.exists():
            raise EmployeeNotFoundError("uploaded file is not available on disk")
        return path

    def latest_upload_metadata(self) -> UploadFileRead:
        record = self.get_latest_upload()
        return UploadFileRead(
            id=record.id,
            original_filename=record.original_filename,
            content_type=record.content_type,
            sheet_name=record.sheet_name,
            file_size_bytes=record.file_size_bytes,
            created_at=record.created_at,
        )


__all__ = [
    "EmployeeService",
    "EmployeeConflictError",
    "EmployeeNotFoundError",
]
