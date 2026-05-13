from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from roster_system.db import Base
from roster_system.time_utils import now_sg


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("staff_id", name="uq_employees_staff_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    serial_number: Mapped[int] = mapped_column(index=True)
    team: Mapped[str] = mapped_column(String(32), index=True)
    deployment_area: Mapped[str] = mapped_column(String(32), index=True, default="UNASSIGNED", nullable=False)
    rank: Mapped[str] = mapped_column(String(32), index=True)
    staff_id: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str] = mapped_column(String(16), default="UNKNOWN", nullable=False)
    terminal: Mapped[str | None] = mapped_column(String(4), nullable=True, index=True)
    cert: Mapped[str | None] = mapped_column(String(64), nullable=True)
    scheme: Mapped[str] = mapped_column(String(8), index=True)
    shift_pattern: Mapped[str] = mapped_column(String(16), default="5W1O", nullable=False)
    shift_patterns_csv: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    contractual_hours: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    forecast_hours: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        onupdate=now_sg,
        nullable=False,
    )

    @property
    def shift_patterns(self) -> list[str]:
        values = [value.strip().upper() for value in (self.shift_patterns_csv or "").split(",") if value.strip()]
        if not values:
            return [self.shift_pattern]
        return values

    @shift_patterns.setter
    def shift_patterns(self, values: list[str]) -> None:
        normalized_values: list[str] = []
        for value in values:
            raw = getattr(value, "value", value)
            if raw is None:
                continue
            text = str(raw).strip().upper()
            if text:
                normalized_values.append(text)

        cleaned = normalized_values
        deduped: list[str] = []
        seen: set[str] = set()
        for value in cleaned:
            if value in seen:
                continue
            deduped.append(value)
            seen.add(value)

        if not deduped:
            deduped = [self.shift_pattern]
        self.shift_patterns_csv = ",".join(deduped)


class UploadFileRecord(Base):
    __tablename__ = "upload_files"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sheet_name: Mapped[str] = mapped_column(String(64), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        nullable=False,
    )


class DeploymentSite(Base):
    __tablename__ = "deployment_sites"
    __table_args__ = (
        UniqueConstraint("site_name", name="uq_deployment_sites_site_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    site_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    required_headcount: Mapped[int] = mapped_column(nullable=False)
    product_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="RECURRING")
    deployment_days_csv: Mapped[str] = mapped_column(String(64), nullable=False, default="MON,TUE,WED,THU,FRI")
    adhoc_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    adhoc_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requirements_json: Mapped[str] = mapped_column(String(4000), nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        onupdate=now_sg,
        nullable=False,
    )


class TrainingCourse(Base):
    __tablename__ = "training_courses"
    __table_args__ = (
        UniqueConstraint("course_name", "start_at", "location", name="uq_training_course_name_start_location"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    course_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    location: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        onupdate=now_sg,
        nullable=False,
    )


class DeploymentAssignment(Base):
    __tablename__ = "deployment_assignments"
    __table_args__ = (
        UniqueConstraint("deployment_date", "site_id", "slot_index", name="uq_deployment_assignments_slot"),
        UniqueConstraint("deployment_date", "employee_id", name="uq_deployment_assignments_employee"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    deployment_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("deployment_sites.id", ondelete="CASCADE"), nullable=False, index=True)
    slot_index: Mapped[int] = mapped_column(nullable=False)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        onupdate=now_sg,
        nullable=False,
    )


class RosterOverride(Base):
    __tablename__ = "roster_overrides"
    __table_args__ = (
        UniqueConstraint("employee_id", "shift_date", name="uq_roster_overrides_employee_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        onupdate=now_sg,
        nullable=False,
    )


class RosterReportingTime(Base):
    __tablename__ = "roster_reporting_times"
    __table_args__ = (
        UniqueConstraint("employee_id", "shift_date", name="uq_roster_reporting_times_employee_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reporting_time: Mapped[str] = mapped_column(String(5), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        onupdate=now_sg,
        nullable=False,
    )


class UserAccount(Base):
    __tablename__ = "user_accounts"
    __table_args__ = (
        UniqueConstraint("username", name="uq_user_accounts_username"),
        UniqueConstraint("email", name="uq_user_accounts_email"),
        UniqueConstraint("staff_id", name="uq_user_accounts_staff_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    staff_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, index=True, default="VIEWER")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        onupdate=now_sg,
        nullable=False,
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    method: Mapped[str] = mapped_column(String(16), nullable=False)
    path: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    actor_subject: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    client_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status_code: Mapped[int] = mapped_column(nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    metadata_json: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_sg,
        nullable=False,
    )
