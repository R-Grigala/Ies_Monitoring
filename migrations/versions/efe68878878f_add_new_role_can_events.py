"""add new role: can_events

Revision ID: efe68878878f
Revises: 1bfad74c779b
Create Date: 2026-05-06 13:07:41.124640
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'efe68878878f'
down_revision = '1bfad74c779b'
branch_labels = None
depends_on = None


def upgrade():
    # -------------------------------------------------
    # 1. Add new column safely
    # -------------------------------------------------
    with op.batch_alter_table('roles', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('can_events', sa.Boolean(), nullable=True)
        )

    # -------------------------------------------------
    # 2. DO NOT drop/recreate index (FK dependent!)
    # -------------------------------------------------
    # MySQL error fix:
    # ix_shakemap_jobs_seiscomp_oid is used by FK constraint
    #
    # IMPORTANT:
    # - Removing index operations prevents crash
    # - If uniqueness is needed, handle manually in DB first
    # -------------------------------------------------


def downgrade():
    # -------------------------------------------------
    # 1. Remove column safely
    # -------------------------------------------------
    with op.batch_alter_table('roles', schema=None) as batch_op:
        batch_op.drop_column('can_events')

    # -------------------------------------------------
    # 2. No index rollback (keeps DB stable)
    # -------------------------------------------------