"""add roster overrides

Revision ID: 20260427_03
Revises: 20260426_02
Create Date: 2026-04-27 10:55:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260427_03"
down_revision = "20260426_02"
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
    if not _has_table("roster_overrides"):
        op.create_table(
            "roster_overrides",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("employee_id", sa.Integer(), nullable=False),
            sa.Column("shift_date", sa.Date(), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("employee_id", "shift_date", name="uq_roster_overrides_employee_date"),
        )

    _create_index_if_missing("ix_roster_overrides_id", "roster_overrides", ["id"])
    _create_index_if_missing("ix_roster_overrides_employee_id", "roster_overrides", ["employee_id"])
    _create_index_if_missing("ix_roster_overrides_shift_date", "roster_overrides", ["shift_date"])


def downgrade() -> None:
    op.drop_index("ix_roster_overrides_shift_date", table_name="roster_overrides")
    op.drop_index("ix_roster_overrides_employee_id", table_name="roster_overrides")
    op.drop_index("ix_roster_overrides_id", table_name="roster_overrides")
    op.drop_table("roster_overrides")
