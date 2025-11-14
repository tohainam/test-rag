"""add question generation jobs table

Revision ID: 20250113_gen_jobs
Revises: 20250110_initial_ragas_evaluation_schema
Create Date: 2025-01-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '20250113_gen_jobs'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create question_generation_jobs table"""
    op.create_table(
        'question_generation_jobs',
        sa.Column('job_id', sa.String(36), nullable=False, comment='Unique job identifier'),
        sa.Column('dataset_id', sa.String(36), nullable=False, comment='Dataset ID'),
        sa.Column(
            'status',
            sa.Enum('pending', 'processing', 'completed', 'failed', name='generationstatus'),
            nullable=False,
            comment='Job status'
        ),
        sa.Column('progress_percent', sa.Float(), nullable=True, comment='Progress percentage'),
        sa.Column('current_file', sa.String(255), nullable=True, comment='Current file being processed'),
        sa.Column('total_files', sa.Integer(), nullable=False, default=0, comment='Total files to process'),
        sa.Column('processed_files', sa.Integer(), nullable=False, default=0, comment='Files processed'),
        sa.Column('failed_files', sa.Integer(), nullable=False, default=0, comment='Files that failed'),
        sa.Column('total_questions_generated', sa.Integer(), nullable=False, default=0, comment='Total questions generated'),
        sa.Column('config', mysql.JSON(), nullable=True, comment='Generation configuration'),
        sa.Column('error_messages', mysql.JSON(), nullable=True, comment='Error messages for failed files'),
        sa.Column('file_results', mysql.JSON(), nullable=True, comment='Per-file results'),
        sa.Column('processing_time_ms', sa.BigInteger(), nullable=True, comment='Processing time in milliseconds'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, comment='Creation timestamp'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True, comment='Start timestamp'),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True, comment='Completion timestamp'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, comment='Last update timestamp'),
        sa.PrimaryKeyConstraint('job_id'),
        sa.ForeignKeyConstraint(
            ['dataset_id'],
            ['evaluation_datasets.dataset_id'],
            ondelete='CASCADE'
        ),
        comment='Question generation jobs'
    )

    # Create indexes
    op.create_index('ix_gen_jobs_dataset_id', 'question_generation_jobs', ['dataset_id'])
    op.create_index('ix_gen_jobs_status', 'question_generation_jobs', ['status'])
    op.create_index('ix_gen_jobs_created_at', 'question_generation_jobs', ['created_at'])


def downgrade() -> None:
    """Drop question_generation_jobs table"""
    op.drop_index('ix_gen_jobs_created_at', table_name='question_generation_jobs')
    op.drop_index('ix_gen_jobs_status', table_name='question_generation_jobs')
    op.drop_index('ix_gen_jobs_dataset_id', table_name='question_generation_jobs')
    op.drop_table('question_generation_jobs')
    op.execute('DROP TYPE IF EXISTS generationstatus')
