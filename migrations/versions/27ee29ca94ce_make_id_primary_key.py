"""make id primary key

Revision ID: 27ee29ca94ce
Revises: a5376d39b7e8
Create Date: 2026-06-12 08:07:14.791824
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = '27ee29ca94ce'
down_revision = 'a5376d39b7e8'
branch_labels = None
depends_on = None


def upgrade():
    # event_id can now be NULL
    with op.batch_alter_table('seismic_events', schema=None) as batch_op:
        batch_op.alter_column(
            'event_id',
            existing_type=mysql.INTEGER(),
            nullable=True
        )

        batch_op.create_index(
            'ix_seismic_events_event_id',
            ['event_id'],
            unique=False
        )


def downgrade():
    with op.batch_alter_table('seismic_events', schema=None) as batch_op:
        batch_op.drop_index('ix_seismic_events_event_id')

        batch_op.alter_column(
            'event_id',
            existing_type=mysql.INTEGER(),
            nullable=False
        )