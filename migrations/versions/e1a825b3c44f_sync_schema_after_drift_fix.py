"""sync schema after drift fix"""

from alembic import op
import sqlalchemy as sa

revision = 'e1a825b3c44f'
down_revision = 'efe68878878f'
branch_labels = None
depends_on = None


def upgrade():
    # ONLY safe column changes

    with op.batch_alter_table('roles') as batch_op:
        batch_op.add_column(sa.Column('can_events', sa.Boolean(), nullable=True))


def downgrade():
    with op.batch_alter_table('roles') as batch_op:
        batch_op.drop_column('can_events')