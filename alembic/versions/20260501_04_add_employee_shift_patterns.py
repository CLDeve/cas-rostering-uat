"""add employee shift patterns

Revision ID: 20260501_04
Revises: 20260427_03
Create Date: 2026-05-01 18:45:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260501_04"
down_revision = "20260427_03"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = inspector.get_columns(table_name)
    return any(column.get("name") == column_name for column in columns)


def upgrade() -> None:
    if not _has_table("employees"):
        return

    if not _has_column("employees", "shift_patterns_csv"):
        op.add_column(
            "employees",
            sa.Column("shift_patterns_csv", sa.String(length=128), nullable=False, server_default=""),
        )

    op.execute(
        sa.text(
            "UPDATE employees SET shift_patterns_csv = shift_pattern "
            "WHERE shift_patterns_csv IS NULL OR shift_patterns_csv = ''"
        )
    )


def downgrade() -> None:
    if _has_table("employees") and _has_column("employees", "shift_patterns_csv"):
        op.drop_column("employees", "shift_patterns_csv")
