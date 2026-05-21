"""update seismic_event

Revision ID: 66d33d38b97d
Revises: e1a825b3c44f
Create Date: 2026-05-21 11:56:18.884427
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '66d33d38b97d'
down_revision = 'e1a825b3c44f'
branch_labels = None
depends_on = None


def upgrade():
    # =========================
    # seismic_events changes only
    # =========================
    with op.batch_alter_table('seismic_events') as batch_op:
        batch_op.add_column(
            sa.Column('location_ge', sa.String(length=100), nullable=True)
        )
        batch_op.add_column(
            sa.Column('location_en', sa.String(length=100), nullable=True)
        )

        batch_op.drop_column('region_ge')
        batch_op.drop_column('region_en')

    # =========================
    # shakemap_jobs index fix
    # =========================
    with op.batch_alter_table('shakemap_jobs') as batch_op:
        batch_op.drop_index('ix_shakemap_jobs_seiscomp_oid')
        batch_op.create_index(
            'ix_shakemap_jobs_seiscomp_oid',
            ['seiscomp_oid'],
            unique=True
        )


def downgrade():
    # =========================
    # revert shakemap_jobs
    # =========================
    with op.batch_alter_table('shakemap_jobs') as batch_op:
        batch_op.drop_index('ix_shakemap_jobs_seiscomp_oid')
        batch_op.create_index(
            'ix_shakemap_jobs_seiscomp_oid',
            ['seiscomp_oid'],
            unique=False
        )

    # =========================
    # revert seismic_events
    # =========================
    with op.batch_alter_table('seismic_events') as batch_op:
        batch_op.add_column(
            sa.Column('region_en', sa.String(length=100), nullable=True)
        )
        batch_op.add_column(
            sa.Column('region_ge', sa.String(length=100), nullable=True)
        )

        batch_op.drop_column('location_en')
        batch_op.drop_column('location_ge')