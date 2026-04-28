import json
from calendar import monthrange
from datetime import date, datetime

from sqlalchemy.exc import IntegrityError

from roster_system.models import DeploymentAssignment, DeploymentSite
from roster_system.repositories.deployment_repository import DeploymentRepository
from roster_system.schemas import (
    DeploymentCoverageCalendarRead,
    DeploymentCoverageDay,
    DeploymentAssignmentsRead,
    DeploymentAssignmentsUpsert,
    DeploymentAssignmentItem,
    DeploymentMode,
    DeploymentRequirement,
    DeploymentSiteCreate,
    DeploymentSiteRead,
    Weekday,
)
from roster_system.time_utils import SG_TZ, ensure_sg_datetime, now_sg


class DeploymentConflictError(Exception):
    pass


class DeploymentValidationError(Exception):
    pass


class DeploymentService:
    def __init__(self, repository: DeploymentRepository):
        self.repository = repository

    def _to_read(self, site: DeploymentSite) -> DeploymentSiteRead:
        raw_days = [day for day in (part.strip().upper() for part in (site.deployment_days_csv or "").split(",")) if day]
        deployment_days = [Weekday(day) for day in raw_days if day in Weekday.__members__]
        if site.mode == DeploymentMode.RECURRING and not deployment_days:
            deployment_days = [Weekday.MON, Weekday.TUE, Weekday.WED, Weekday.THU, Weekday.FRI]

        requirements: list[DeploymentRequirement] = []
        try:
            parsed = json.loads(site.requirements_json or "[]")
            if isinstance(parsed, list):
                requirements = [DeploymentRequirement(**row) for row in parsed]
        except (json.JSONDecodeError, TypeError, ValueError):
            requirements = []

        if not requirements:
            requirements = [
                DeploymentRequirement(
                    product_type=site.product_type,
                    required_headcount=site.required_headcount,
                    reporting_from="08:00",
                    reporting_to="16:00",
                    next_shift_from="16:00",
                    next_shift_to="00:00",
                )
            ]

        return DeploymentSiteRead(
            id=site.id,
            site_name=site.site_name,
            mode=site.mode,
            deployment_days=deployment_days,
            adhoc_start_at=site.adhoc_start_at,
            adhoc_end_at=site.adhoc_end_at,
            requirements=requirements,
            created_at=site.created_at,
            updated_at=site.updated_at,
        )

    def create_site(self, payload: DeploymentSiteCreate) -> DeploymentSiteRead:
        data = payload.model_dump()
        requirements = data.pop("requirements")
        deployment_days = data.pop("deployment_days")
        mode = data.get("mode", DeploymentMode.RECURRING)
        first_requirement = requirements[0]
        site = DeploymentSite(
            **data,
            required_headcount=first_requirement["required_headcount"],
            product_type=first_requirement["product_type"],
            deployment_days_csv=",".join(deployment_days) if mode == DeploymentMode.RECURRING else "",
            requirements_json=json.dumps(requirements),
        )
        try:
            created = self.repository.create(site)
            return self._to_read(created)
        except IntegrityError as exc:
            self.repository.db.rollback()
            raise DeploymentConflictError("site_name already exists") from exc

    def list_sites(self) -> list[DeploymentSiteRead]:
        return [self._to_read(site) for site in self.repository.list_all()]

    @staticmethod
    def _weekday_code(value: date) -> str:
        weekday_codes = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
        return weekday_codes[value.weekday()]

    @staticmethod
    def _day_window(value: date) -> tuple:
        start = datetime(value.year, value.month, value.day, 0, 0, 0, tzinfo=SG_TZ)
        end = datetime(value.year, value.month, value.day, 23, 59, 59, tzinfo=SG_TZ)
        return start, end

    def _site_required_headcount(self, site: DeploymentSite) -> int:
        try:
            parsed = json.loads(site.requirements_json or "[]")
            if isinstance(parsed, list) and parsed:
                total = sum(int(item.get("required_headcount", 0)) for item in parsed if isinstance(item, dict))
                if total > 0:
                    return total
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
        return int(site.required_headcount)

    def _is_site_active_on_date(self, site: DeploymentSite, target_date: date) -> bool:
        if site.mode == DeploymentMode.ADHOC:
            if site.adhoc_start_at is None or site.adhoc_end_at is None:
                return False
            day_start, day_end = self._day_window(target_date)
            adhoc_start = ensure_sg_datetime(site.adhoc_start_at)
            adhoc_end = ensure_sg_datetime(site.adhoc_end_at)
            return bool(adhoc_start and adhoc_end and adhoc_end >= day_start and adhoc_start <= day_end)

        weekday = self._weekday_code(target_date)
        deployment_days = {
            part.strip().upper()
            for part in (site.deployment_days_csv or "").split(",")
            if part.strip()
        }
        return weekday in deployment_days

    def get_daily_coverage(self, target_date: date) -> DeploymentCoverageDay:
        sites = self.repository.list_all()
        active_sites = [site for site in sites if self._is_site_active_on_date(site, target_date)]
        active_site_ids = {site.id for site in active_sites}
        required_headcount = sum(self._site_required_headcount(site) for site in active_sites)

        assignments = self.repository.list_assignments_by_date(target_date)
        assigned_employee_ids = {
            row.employee_id
            for row in assignments
            if row.site_id in active_site_ids
        }
        assigned_headcount = len(assigned_employee_ids)
        gap = required_headcount - assigned_headcount

        return DeploymentCoverageDay(
            date=target_date,
            active_sites=len(active_sites),
            required_headcount=required_headcount,
            assigned_headcount=assigned_headcount,
            coverage_gap=gap,
            is_covered=gap <= 0,
        )

    def get_monthly_coverage(self, year: int, month: int) -> DeploymentCoverageCalendarRead:
        days_in_month = monthrange(year, month)[1]
        rows = [self.get_daily_coverage(date(year, month, day)) for day in range(1, days_in_month + 1)]
        return DeploymentCoverageCalendarRead(
            year=year,
            month=month,
            days=rows,
            totals_required_headcount=sum(row.required_headcount for row in rows),
            totals_assigned_headcount=sum(row.assigned_headcount for row in rows),
        )

    def list_assignments(self, deployment_date: date) -> DeploymentAssignmentsRead:
        rows = self.repository.list_assignments_by_date(deployment_date)
        updated_at = max((row.updated_at for row in rows), default=None)
        return DeploymentAssignmentsRead(
            deployment_date=deployment_date,
            assignments=[
                DeploymentAssignmentItem(
                    site_id=row.site_id,
                    slot_index=row.slot_index,
                    employee_id=row.employee_id,
                )
                for row in rows
            ],
            updated_at=updated_at,
        )

    def replace_assignments(self, payload: DeploymentAssignmentsUpsert) -> DeploymentAssignmentsRead:
        site_ids = self.repository.list_site_ids()
        employee_ids = self.repository.list_employee_ids()

        for row in payload.assignments:
            if row.site_id not in site_ids:
                raise DeploymentValidationError(f"site_id {row.site_id} does not exist")
            if row.employee_id not in employee_ids:
                raise DeploymentValidationError(f"employee_id {row.employee_id} does not exist or inactive")

        assignment_models = [
            DeploymentAssignment(
                deployment_date=payload.deployment_date,
                site_id=row.site_id,
                slot_index=row.slot_index,
                employee_id=row.employee_id,
            )
            for row in payload.assignments
        ]

        try:
            stored = self.repository.replace_assignments_for_date(payload.deployment_date, assignment_models)
        except IntegrityError as exc:
            self.repository.db.rollback()
            raise DeploymentValidationError("invalid deployment assignments payload") from exc

        updated_at = max((row.updated_at for row in stored), default=now_sg())
        return DeploymentAssignmentsRead(
            deployment_date=payload.deployment_date,
            assignments=[
                DeploymentAssignmentItem(
                    site_id=row.site_id,
                    slot_index=row.slot_index,
                    employee_id=row.employee_id,
                )
                for row in stored
            ],
            updated_at=updated_at,
        )
