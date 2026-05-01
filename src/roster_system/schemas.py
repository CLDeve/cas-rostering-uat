from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from roster_system.time_utils import ensure_sg_datetime


class ShiftPattern(str, Enum):
    WORK_4_OFF_2 = "4W2O"
    WORK_5_OFF_1 = "5W1O"


class Gender(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"
    UNKNOWN = "UNKNOWN"


class ProductType(str, Enum):
    APO = "APO"
    AVSO = "AVSO"


class DeploymentMode(str, Enum):
    RECURRING = "RECURRING"
    ADHOC = "ADHOC"


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    PLANNER = "PLANNER"
    VIEWER = "VIEWER"


class Weekday(str, Enum):
    MON = "MON"
    TUE = "TUE"
    WED = "WED"
    THU = "THU"
    FRI = "FRI"
    SAT = "SAT"
    SUN = "SUN"


class EmployeeBase(BaseModel):
    serial_number: int | None = Field(default=None, ge=1)
    team: str = Field(..., min_length=1, max_length=32)
    rank: str = Field(..., min_length=1, max_length=32)
    staff_id: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=128)
    start_date: date | None = None
    gender: Gender = Field(default=Gender.UNKNOWN)
    cert: str | None = Field(default=None, max_length=64)
    scheme: str = Field(..., min_length=1, max_length=8)
    shift_pattern: ShiftPattern = Field(default=ShiftPattern.WORK_5_OFF_1)
    shift_patterns: list[ShiftPattern] = Field(default_factory=list)
    contractual_hours: Decimal = Field(..., ge=0, decimal_places=2)
    forecast_hours: Decimal | None = Field(default=None, ge=0, decimal_places=2)

    @field_validator("team", "rank", "staff_id", "name", "scheme")
    @classmethod
    def trim_mandatory(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("field cannot be blank")
        return cleaned

    @field_validator("cert")
    @classmethod
    def trim_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def normalize_shift_patterns(self):
        deduped = list(dict.fromkeys(self.shift_patterns))
        if not deduped:
            deduped = [self.shift_pattern]
        self.shift_patterns = deduped
        self.shift_pattern = deduped[0]
        return self


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    serial_number: int | None = Field(default=None, ge=1)
    team: str | None = Field(default=None, min_length=1, max_length=32)
    rank: str | None = Field(default=None, min_length=1, max_length=32)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    start_date: date | None = None
    gender: Gender | None = None
    cert: str | None = Field(default=None, max_length=64)
    scheme: str | None = Field(default=None, min_length=1, max_length=8)
    shift_pattern: ShiftPattern | None = None
    shift_patterns: list[ShiftPattern] | None = None
    contractual_hours: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    forecast_hours: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    is_active: bool | None = None

    @field_validator("team", "rank", "name", "scheme")
    @classmethod
    def trim_partial(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("field cannot be blank")
        return cleaned

    @model_validator(mode="after")
    def normalize_shift_patterns(self):
        if self.shift_patterns is not None:
            deduped = list(dict.fromkeys(self.shift_patterns))
            if not deduped:
                raise ValueError("shift_patterns cannot be empty when provided")
            self.shift_patterns = deduped
            self.shift_pattern = deduped[0]
        return self


class EmployeeRead(EmployeeBase):
    serial_number: int
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedEmployees(BaseModel):
    items: list[EmployeeRead]
    total: int
    page: int
    page_size: int


class EmployeeImportResult(BaseModel):
    created: int
    updated: int
    total_processed: int
    sheet_name: str
    upload_file_id: int | None = None
    upload_filename: str | None = None
    download_url: str | None = None


class UploadFileRead(BaseModel):
    id: int
    original_filename: str
    content_type: str | None
    sheet_name: str
    file_size_bytes: int
    created_at: datetime


class ShiftPlanDay(BaseModel):
    day_index: int
    status: str


class ShiftPlanResponse(BaseModel):
    employee_id: int
    shift_pattern: ShiftPattern
    days: int
    start_offset: int
    work_days: int
    off_days: int
    plan: list[ShiftPlanDay]


class RosterCalendarDay(BaseModel):
    day: int
    weekday: str


class RosterCalendarEmployeeRow(BaseModel):
    employee_id: int
    serial_number: int
    staff_id: str
    name: str
    team: str
    shift_pattern: ShiftPattern
    schedule: list[str]
    forecast_hours: int = Field(..., ge=0)


class RosterCalendarResponse(BaseModel):
    year: int
    month: int
    days_in_month: int
    day_headers: list[RosterCalendarDay]
    employees: list[RosterCalendarEmployeeRow]


RosterStatus = Literal["WORK", "OFF", "OT1", "OT2", "EMPTY"]


class RosterCalendarSaveRow(BaseModel):
    employee_id: int = Field(..., ge=1)
    schedule: list[RosterStatus] = Field(default_factory=list)


class RosterCalendarSaveRequest(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)
    employees: list[RosterCalendarSaveRow] = Field(default_factory=list)


class RosterCalendarSaveResponse(BaseModel):
    year: int
    month: int
    employees_saved: int = Field(..., ge=0)
    overrides_saved: int = Field(..., ge=0)


class TrainingCourseBase(BaseModel):
    course_name: str = Field(..., min_length=1, max_length=128)
    location: str = Field(..., min_length=1, max_length=128)
    start_at: datetime
    end_at: datetime

    @field_validator("course_name", "location")
    @classmethod
    def trim_text_fields(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("field cannot be blank")
        return cleaned

    @model_validator(mode="after")
    def validate_time_window(self):
        self.start_at = ensure_sg_datetime(self.start_at)
        self.end_at = ensure_sg_datetime(self.end_at)
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be later than start_at")
        return self


class TrainingCourseCreate(TrainingCourseBase):
    pass


class TrainingCourseRead(TrainingCourseBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DeploymentSiteBase(BaseModel):
    site_name: str = Field(..., min_length=1, max_length=128)
    mode: DeploymentMode = DeploymentMode.RECURRING
    deployment_days: list[Weekday] = Field(default_factory=list)
    adhoc_start_at: datetime | None = None
    adhoc_end_at: datetime | None = None

    @field_validator("site_name")
    @classmethod
    def trim_site_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("site_name cannot be blank")
        return cleaned

    @field_validator("deployment_days")
    @classmethod
    def unique_days(cls, value: list[Weekday]) -> list[Weekday]:
        deduped = list(dict.fromkeys(value))
        return deduped

    @model_validator(mode="after")
    def validate_mode_fields(self):
        self.adhoc_start_at = ensure_sg_datetime(self.adhoc_start_at)
        self.adhoc_end_at = ensure_sg_datetime(self.adhoc_end_at)

        if self.mode == DeploymentMode.RECURRING:
            if not self.deployment_days:
                raise ValueError("deployment_days is required for recurring sites")
            if self.adhoc_start_at is not None or self.adhoc_end_at is not None:
                raise ValueError("adhoc_start_at and adhoc_end_at must be empty for recurring sites")
        else:
            if self.deployment_days:
                raise ValueError("deployment_days must be empty for adhoc sites")
            if self.adhoc_start_at is None or self.adhoc_end_at is None:
                raise ValueError("adhoc_start_at and adhoc_end_at are required for adhoc sites")
            if self.adhoc_end_at <= self.adhoc_start_at:
                raise ValueError("adhoc_end_at must be later than adhoc_start_at")
        return self


class DeploymentRequirement(BaseModel):
    product_type: ProductType
    required_headcount: int = Field(..., ge=1)
    reporting_from: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    reporting_to: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    next_shift_from: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    next_shift_to: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class DeploymentSiteCreate(DeploymentSiteBase):
    requirements: list[DeploymentRequirement] = Field(..., min_length=1)


class DeploymentSiteRead(DeploymentSiteBase):
    requirements: list[DeploymentRequirement]
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DeploymentAssignmentItem(BaseModel):
    site_id: int = Field(..., ge=1)
    slot_index: int = Field(..., ge=0, le=24)
    employee_id: int = Field(..., ge=1)


class DeploymentAssignmentsUpsert(BaseModel):
    deployment_date: date
    assignments: list[DeploymentAssignmentItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_constraints(self):
        site_slots = set()
        employees = set()
        for row in self.assignments:
            site_slot_key = (row.site_id, row.slot_index)
            if site_slot_key in site_slots:
                raise ValueError("duplicate assignment for same site_id and slot_index")
            site_slots.add(site_slot_key)

            if row.employee_id in employees:
                raise ValueError("same employee_id cannot be assigned more than once for a deployment date")
            employees.add(row.employee_id)
        return self


class DeploymentAssignmentsRead(BaseModel):
    deployment_date: date
    assignments: list[DeploymentAssignmentItem] = Field(default_factory=list)
    updated_at: datetime | None = None


class DeploymentCoverageDay(BaseModel):
    date: date
    active_sites: int = Field(..., ge=0)
    required_headcount: int = Field(..., ge=0)
    assigned_headcount: int = Field(..., ge=0)
    coverage_gap: int
    is_covered: bool


class DeploymentCoverageCalendarRead(BaseModel):
    year: int
    month: int
    days: list[DeploymentCoverageDay]
    totals_required_headcount: int = Field(..., ge=0)
    totals_assigned_headcount: int = Field(..., ge=0)


class UserAccountBase(BaseModel):
    staff_id: str = Field(..., min_length=1, max_length=32)
    username: str = Field(..., min_length=3, max_length=64)
    display_name: str = Field(..., min_length=1, max_length=128)
    role: UserRole = UserRole.VIEWER

    @field_validator("staff_id", "username", "display_name")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("field cannot be blank")
        return cleaned

class UserAccountCreate(UserAccountBase):
    pass


class UserAccountStatusUpdate(BaseModel):
    is_active: bool


class UserAccountRead(UserAccountBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
