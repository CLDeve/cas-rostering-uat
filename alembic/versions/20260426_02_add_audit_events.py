"""add audit events

Revision ID: 20260426_02
Revises: 20260426_01
Create Date: 2026-04-26 01:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260426_02"
down_revision = "20260426_01"
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
    if not _has_table("audit_events"):
        op.create_table(
            "audit_events",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("event_type", sa.String(length=64), nullable=False),
            sa.Column("method", sa.String(length=16), nullable=False),
            sa.Column("path", sa.String(length=255), nullable=False),
            sa.Column("actor_subject", sa.String(length=128), nullable=False),
            sa.Column("actor_role", sa.String(length=32), nullable=False),
            sa.Column("client_ip", sa.String(length=64), nullable=True),
            sa.Column("user_agent", sa.String(length=255), nullable=True),
            sa.Column("status_code", sa.Integer(), nullable=False),
            sa.Column("success", sa.Boolean(), nullable=False),
            sa.Column("metadata_json", sa.String(length=4000), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    _create_index_if_missing("ix_audit_events_id", "audit_events", ["id"])
    _create_index_if_missing("ix_audit_events_event_type", "audit_events", ["event_type"])
    _create_index_if_missing("ix_audit_events_path", "audit_events", ["path"])
    _create_index_if_missing("ix_audit_events_actor_subject", "audit_events", ["actor_subject"])
    _create_index_if_missing("ix_audit_events_actor_role", "audit_events", ["actor_role"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_actor_role", table_name="audit_events")
    op.drop_index("ix_audit_events_actor_subject", table_name="audit_events")
    op.drop_index("ix_audit_events_path", table_name="audit_events")
    op.drop_index("ix_audit_events_event_type", table_name="audit_events")
    op.drop_index("ix_audit_events_id", table_name="audit_events")
    op.drop_table("audit_events")
