"""initial schema

Revision ID: 20260426_01
Revises:
Create Date: 2026-04-26 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260426_01"
down_revision = None
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _has_index(table_name: str, index_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(index.get("name") == index_name for index in inspector.get_indexes(table_name))


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str], unique: bool = False) -> None:
    if not _has_index(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    if not _has_table("employees"):
        op.create_table(
            "employees",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("serial_number", sa.Integer(), nullable=False),
            sa.Column("team", sa.String(length=32), nullable=False),
            sa.Column("rank", sa.String(length=32), nullable=False),
            sa.Column("staff_id", sa.String(length=32), nullable=False),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("start_date", sa.Date(), nullable=True),
            sa.Column("gender", sa.String(length=16), nullable=False),
            sa.Column("cert", sa.String(length=64), nullable=True),
            sa.Column("scheme", sa.String(length=8), nullable=False),
            sa.Column("shift_pattern", sa.String(length=16), nullable=False),
            sa.Column("contractual_hours", sa.Numeric(10, 2), nullable=False),
            sa.Column("forecast_hours", sa.Numeric(10, 2), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("staff_id", name="uq_employees_staff_id"),
        )
    _create_index_if_missing("ix_employees_id", "employees", ["id"])
    _create_index_if_missing("ix_employees_name", "employees", ["name"])
    _create_index_if_missing("ix_employees_rank", "employees", ["rank"])
    _create_index_if_missing("ix_employees_scheme", "employees", ["scheme"])
    _create_index_if_missing("ix_employees_serial_number", "employees", ["serial_number"])
    _create_index_if_missing("ix_employees_staff_id", "employees", ["staff_id"])
    _create_index_if_missing("ix_employees_team", "employees", ["team"])

    if not _has_table("upload_files"):
        op.create_table(
            "upload_files",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("original_filename", sa.String(length=255), nullable=False),
            sa.Column("stored_filename", sa.String(length=255), nullable=False),
            sa.Column("content_type", sa.String(length=128), nullable=True),
            sa.Column("sheet_name", sa.String(length=64), nullable=False),
            sa.Column("file_size_bytes", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("stored_filename"),
        )
    _create_index_if_missing("ix_upload_files_id", "upload_files", ["id"])

    if not _has_table("deployment_sites"):
        op.create_table(
            "deployment_sites",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("site_name", sa.String(length=128), nullable=False),
            sa.Column("required_headcount", sa.Integer(), nullable=False),
            sa.Column("product_type", sa.String(length=16), nullable=False),
            sa.Column("mode", sa.String(length=16), nullable=False),
            sa.Column("deployment_days_csv", sa.String(length=64), nullable=False),
            sa.Column("adhoc_start_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("adhoc_end_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("requirements_json", sa.String(length=4000), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("site_name", name="uq_deployment_sites_site_name"),
        )
    _create_index_if_missing("ix_deployment_sites_id", "deployment_sites", ["id"])
    _create_index_if_missing("ix_deployment_sites_product_type", "deployment_sites", ["product_type"])
    _create_index_if_missing("ix_deployment_sites_site_name", "deployment_sites", ["site_name"])

    if not _has_table("training_courses"):
        op.create_table(
            "training_courses",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("course_name", sa.String(length=128), nullable=False),
            sa.Column("location", sa.String(length=128), nullable=False),
            sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "course_name",
                "start_at",
                "location",
                name="uq_training_course_name_start_location",
            ),
        )
    _create_index_if_missing("ix_training_courses_course_name", "training_courses", ["course_name"])
    _create_index_if_missing("ix_training_courses_id", "training_courses", ["id"])
    _create_index_if_missing("ix_training_courses_location", "training_courses", ["location"])

    if not _has_table("user_accounts"):
        op.create_table(
            "user_accounts",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("staff_id", sa.String(length=32), nullable=False),
            sa.Column("username", sa.String(length=64), nullable=False),
            sa.Column("display_name", sa.String(length=128), nullable=False),
            sa.Column("email", sa.String(length=256), nullable=False),
            sa.Column("role", sa.String(length=32), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("email", name="uq_user_accounts_email"),
            sa.UniqueConstraint("staff_id", name="uq_user_accounts_staff_id"),
            sa.UniqueConstraint("username", name="uq_user_accounts_username"),
        )
    _create_index_if_missing("ix_user_accounts_email", "user_accounts", ["email"])
    _create_index_if_missing("ix_user_accounts_id", "user_accounts", ["id"])
    _create_index_if_missing("ix_user_accounts_staff_id", "user_accounts", ["staff_id"])
    _create_index_if_missing("ix_user_accounts_username", "user_accounts", ["username"])
    _create_index_if_missing("ix_user_accounts_display_name", "user_accounts", ["display_name"])
    _create_index_if_missing("ix_user_accounts_role", "user_accounts", ["role"])

    if not _has_table("deployment_assignments"):
        op.create_table(
            "deployment_assignments",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("deployment_date", sa.Date(), nullable=False),
            sa.Column("site_id", sa.Integer(), nullable=False),
            sa.Column("slot_index", sa.Integer(), nullable=False),
            sa.Column("employee_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["site_id"], ["deployment_sites.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "deployment_date",
                "employee_id",
                name="uq_deployment_assignments_employee",
            ),
            sa.UniqueConstraint(
                "deployment_date",
                "site_id",
                "slot_index",
                name="uq_deployment_assignments_slot",
            ),
        )
    _create_index_if_missing("ix_deployment_assignments_deployment_date", "deployment_assignments", ["deployment_date"])
    _create_index_if_missing("ix_deployment_assignments_employee_id", "deployment_assignments", ["employee_id"])
    _create_index_if_missing("ix_deployment_assignments_id", "deployment_assignments", ["id"])
    _create_index_if_missing("ix_deployment_assignments_site_id", "deployment_assignments", ["site_id"])


def downgrade() -> None:
    op.drop_index("ix_deployment_assignments_site_id", table_name="deployment_assignments")
    op.drop_index("ix_deployment_assignments_id", table_name="deployment_assignments")
    op.drop_index("ix_deployment_assignments_employee_id", table_name="deployment_assignments")
    op.drop_index("ix_deployment_assignments_deployment_date", table_name="deployment_assignments")
    op.drop_table("deployment_assignments")

    op.drop_index("ix_user_accounts_role", table_name="user_accounts")
    op.drop_index("ix_user_accounts_display_name", table_name="user_accounts")
    op.drop_index("ix_user_accounts_username", table_name="user_accounts")
    op.drop_index("ix_user_accounts_staff_id", table_name="user_accounts")
    op.drop_index("ix_user_accounts_id", table_name="user_accounts")
    op.drop_index("ix_user_accounts_email", table_name="user_accounts")
    op.drop_table("user_accounts")

    op.drop_index("ix_training_courses_location", table_name="training_courses")
    op.drop_index("ix_training_courses_id", table_name="training_courses")
    op.drop_index("ix_training_courses_course_name", table_name="training_courses")
    op.drop_table("training_courses")

    op.drop_index("ix_deployment_sites_site_name", table_name="deployment_sites")
    op.drop_index("ix_deployment_sites_product_type", table_name="deployment_sites")
    op.drop_index("ix_deployment_sites_id", table_name="deployment_sites")
    op.drop_table("deployment_sites")

    op.drop_index("ix_upload_files_id", table_name="upload_files")
    op.drop_table("upload_files")

    op.drop_index("ix_employees_team", table_name="employees")
    op.drop_index("ix_employees_staff_id", table_name="employees")
    op.drop_index("ix_employees_serial_number", table_name="employees")
    op.drop_index("ix_employees_scheme", table_name="employees")
    op.drop_index("ix_employees_rank", table_name="employees")
    op.drop_index("ix_employees_name", table_name="employees")
    op.drop_index("ix_employees_id", table_name="employees")
    op.drop_table("employees")
