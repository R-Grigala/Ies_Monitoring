"""seiscomp_oid length safe migration

Revision ID: 1bfad74c779b
Revises: 6a88a6aac134
Create Date: 2026-04-23 13:23:43.224229

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = '1bfad74c779b'
down_revision = '6a88a6aac134'
branch_labels = None
depends_on = None


def upgrade():

    # 🔴 STEP 1 — drop FK first (IMPORTANT)
    op.drop_constraint(
        'fk_shakemap_jobs_event_oid',
        'shakemap_jobs',
        type_='foreignkey'
    )

    # 🔵 STEP 2 — alter parent table first
    with op.batch_alter_table('seismic_events') as batch_op:
        batch_op.alter_column(
            'seiscomp_oid',
            existing_type=mysql.VARCHAR(length=50),
            type_=sa.String(length=20),
            nullable=False
        )

        batch_op.alter_column(
            'area',
            existing_type=mysql.VARCHAR(length=50),
            type_=sa.String(length=20),
            existing_nullable=True
        )

    # 🔵 STEP 3 — alter child table
    with op.batch_alter_table('shakemap_jobs') as batch_op:
        batch_op.alter_column(
            'seiscomp_oid',
            existing_type=mysql.VARCHAR(length=50),
            type_=sa.String(length=20),
            nullable=False
        )

        # recreate index safely
        batch_op.drop_index('ix_shakemap_jobs_seiscomp_oid')
        batch_op.create_index(
            'ix_shakemap_jobs_seiscomp_oid',
            ['seiscomp_oid'],
            unique=False
        )

    # 🔵 STEP 4 — recreate FK
    op.create_foreign_key(
        'fk_shakemap_jobs_event_oid',
        'shakemap_jobs',
        'seismic_events',
        ['seiscomp_oid'],
        ['seiscomp_oid']
    )


def downgrade():

    # 🔴 STEP 1 — drop FK
    op.drop_constraint(
        'fk_shakemap_jobs_event_oid',
        'shakemap_jobs',
        type_='foreignkey'
    )

    # 🔵 STEP 2 — revert child table
    with op.batch_alter_table('shakemap_jobs') as batch_op:
        batch_op.drop_index('ix_shakemap_jobs_seiscomp_oid')
        batch_op.alter_column(
            'seiscomp_oid',
            existing_type=sa.String(length=20),
            type_=mysql.VARCHAR(length=50),
            nullable=False
        )

    # 🔵 STEP 3 — revert parent table
    with op.batch_alter_table('seismic_events') as batch_op:
        batch_op.alter_column(
            'area',
            existing_type=sa.String(length=20),
            type_=mysql.VARCHAR(length=50),
            existing_nullable=True
        )

        batch_op.alter_column(
            'seiscomp_oid',
            existing_type=sa.String(length=20),
            type_=mysql.VARCHAR(length=50),
            nullable=False
        )

    # 🔴 STEP 4 — restore FK
    op.create_foreign_key(
        'fk_shakemap_jobs_event_oid',
        'shakemap_jobs',
        'seismic_events',
        ['seiscomp_oid'],
        ['seiscomp_oid']
    )