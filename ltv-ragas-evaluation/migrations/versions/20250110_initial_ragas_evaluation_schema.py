"""Initial RAGAS Evaluation schema

Revision ID: 001_initial
Revises:
Create Date: 2025-01-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables for RAGAS Evaluation system."""
    from sqlalchemy import inspect
    
    # Get connection to check existing tables
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = inspector.get_table_names()

    # Create evaluation_files table
    if 'evaluation_files' not in existing_tables:
        op.create_table(
            'evaluation_files',
            sa.Column('file_id', sa.String(36), nullable=False, comment='Unique file identifier'),
            sa.Column('filename', sa.String(255), nullable=False, comment='Display filename'),
            sa.Column('original_filename', sa.String(255), nullable=False, comment='Original uploaded filename'),
            sa.Column('content_type', sa.String(100), nullable=False, comment='MIME type of the file'),
            sa.Column('filesize', sa.Integer(), nullable=False, comment='File size in bytes'),
            sa.Column('minio_bucket', sa.String(100), nullable=False, server_default='evaluation', comment='MinIO bucket name'),
            sa.Column('minio_object_name', sa.String(255), nullable=False, comment='Object name in MinIO'),
            sa.Column('uploaded_by_user_id', sa.Integer(), nullable=False, comment='User ID who uploaded the file'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), comment='Creation timestamp'),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), comment='Last update timestamp'),
            sa.PrimaryKeyConstraint('file_id', name='pk_evaluation_files')
        )
        op.create_index('ix_evaluation_files_uploaded_by', 'evaluation_files', ['uploaded_by_user_id'])
        op.create_index('ix_evaluation_files_created_at', 'evaluation_files', ['created_at'])

    # Create evaluation_datasets table
    if 'evaluation_datasets' not in existing_tables:
        op.create_table(
            'evaluation_datasets',
            sa.Column('dataset_id', sa.String(36), nullable=False, comment='Unique dataset identifier'),
            sa.Column('name', sa.String(255), nullable=False, comment='Dataset name'),
            sa.Column('description', sa.Text(), nullable=True, comment='Dataset description'),
            sa.Column('source', sa.Enum('manual', 'llm_generated', name='dataset_source_enum'), nullable=False, comment='How the dataset was created'),
            sa.Column('config', mysql.JSON(), nullable=True, comment='Dataset configuration (JSON)'),
            sa.Column('total_questions', sa.Integer(), nullable=False, server_default='0', comment='Total number of questions'),
            sa.Column('created_by_user_id', sa.Integer(), nullable=False, comment='User ID who created the dataset'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), comment='Creation timestamp'),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), comment='Last update timestamp'),
            sa.PrimaryKeyConstraint('dataset_id', name='pk_evaluation_datasets')
        )
        op.create_index('ix_evaluation_datasets_created_by', 'evaluation_datasets', ['created_by_user_id'])
        op.create_index('ix_evaluation_datasets_source', 'evaluation_datasets', ['source'])
        op.create_index('ix_evaluation_datasets_created_at', 'evaluation_datasets', ['created_at'])

    # Create dataset_questions table
    if 'dataset_questions' not in existing_tables:
        op.create_table(
            'dataset_questions',
            sa.Column('question_id', sa.String(36), nullable=False, comment='Unique question identifier'),
            sa.Column('dataset_id', sa.String(36), nullable=False, comment='Dataset this question belongs to'),
            sa.Column('question', sa.Text(), nullable=False, comment='The question text'),
            sa.Column('expected_context', sa.Text(), nullable=False, comment='Expected context/answer for evaluation'),
            sa.Column('order_index', sa.Integer(), nullable=False, comment='Order index for sequential testing'),
            sa.Column('question_metadata', mysql.JSON(), nullable=True, comment='Additional metadata (JSON)'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), comment='Creation timestamp'),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), comment='Last update timestamp'),
            sa.ForeignKeyConstraint(['dataset_id'], ['evaluation_datasets.dataset_id'], name='fk_dataset_questions_dataset_id_evaluation_datasets', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('question_id', name='pk_dataset_questions'),
            sa.UniqueConstraint('dataset_id', 'order_index', name='uq_dataset_question_order')
        )
        op.create_index('ix_dataset_questions_dataset_id', 'dataset_questions', ['dataset_id'])
        op.create_index('ix_dataset_questions_order_index', 'dataset_questions', ['order_index'])

    # Create evaluation_jobs table
    if 'evaluation_jobs' not in existing_tables:
        op.create_table(
            'evaluation_jobs',
            sa.Column('job_id', sa.String(36), nullable=False, comment='Unique job identifier'),
            sa.Column('status', sa.Enum('pending', 'processing', 'completed', 'failed', name='job_status_enum'), nullable=False, server_default='pending', comment='Current job status'),
            sa.Column('phase', sa.String(100), nullable=True, comment="Current phase (e.g., 'validating', 'testing_questions')"),
            sa.Column('progress_percent', sa.Integer(), nullable=False, server_default='0', comment='Progress percentage (0-100)'),
            sa.Column('current_step', sa.String(255), nullable=True, comment="Current step description (e.g., 'Testing question 35/100')"),
            sa.Column('config', mysql.JSON(), nullable=True, comment='Job configuration (JSON)'),
            sa.Column('created_by_user_id', sa.Integer(), nullable=False, comment='User ID who created the job'),
            sa.Column('error_message', sa.Text(), nullable=True, comment='Error message if job failed'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), comment='Job creation timestamp'),
            sa.Column('started_at', sa.DateTime(timezone=True), nullable=True, comment='Job start timestamp'),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True, comment='Job completion timestamp'),
            sa.PrimaryKeyConstraint('job_id', name='pk_evaluation_jobs')
        )
        op.create_index('ix_evaluation_jobs_status', 'evaluation_jobs', ['status'])
        op.create_index('ix_evaluation_jobs_created_by', 'evaluation_jobs', ['created_by_user_id'])
        op.create_index('ix_evaluation_jobs_created_at', 'evaluation_jobs', ['created_at'])

    # Create evaluation_runs table
    if 'evaluation_runs' not in existing_tables:
        op.create_table(
            'evaluation_runs',
            sa.Column('run_id', sa.String(36), nullable=False, comment='Unique run identifier'),
            sa.Column('dataset_id', sa.String(36), nullable=False, comment='Dataset being evaluated'),
            sa.Column('job_id', sa.String(36), nullable=False, comment='Associated job'),
            sa.Column('status', sa.Enum('pending', 'running', 'completed', 'failed', name='run_status_enum'), nullable=False, server_default='pending', comment='Current run status'),
            sa.Column('config', mysql.JSON(), nullable=True, comment='Run configuration (topK, metrics, etc.)'),
            sa.Column('total_questions', sa.Integer(), nullable=False, server_default='0', comment='Total number of questions to test'),
            sa.Column('successful_questions', sa.Integer(), nullable=False, server_default='0', comment='Number of successfully tested questions'),
            sa.Column('failed_questions', sa.Integer(), nullable=False, server_default='0', comment='Number of failed questions'),
            sa.Column('current_question_index', sa.Integer(), nullable=True, comment='Current question index being tested (for progress)'),
            sa.Column('current_question_id', sa.String(36), nullable=True, comment='Current question ID being tested'),
            sa.Column('average_scores', mysql.JSON(), nullable=True, comment='Average scores (precision, recall, relevancy)'),
            sa.Column('statistics', mysql.JSON(), nullable=True, comment='Statistical data (min, max, std, etc.)'),
            sa.Column('processing_time_ms', sa.BigInteger(), nullable=True, comment='Total processing time in milliseconds'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), comment='Run creation timestamp'),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True, comment='Run completion timestamp'),
            sa.ForeignKeyConstraint(['dataset_id'], ['evaluation_datasets.dataset_id'], name='fk_evaluation_runs_dataset_id_evaluation_datasets', ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['job_id'], ['evaluation_jobs.job_id'], name='fk_evaluation_runs_job_id_evaluation_jobs', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('run_id', name='pk_evaluation_runs')
        )
        op.create_index('ix_evaluation_runs_dataset_id', 'evaluation_runs', ['dataset_id'])
        op.create_index('ix_evaluation_runs_job_id', 'evaluation_runs', ['job_id'])
        op.create_index('ix_evaluation_runs_created_at', 'evaluation_runs', ['created_at'])
        op.create_index('ix_evaluation_runs_status', 'evaluation_runs', ['status'])

    # Create evaluation_results table
    if 'evaluation_results' not in existing_tables:
        op.create_table(
            'evaluation_results',
            sa.Column('result_id', sa.String(36), nullable=False, comment='Unique result identifier'),
            sa.Column('run_id', sa.String(36), nullable=False, comment='Evaluation run this result belongs to'),
            sa.Column('question_id', sa.String(36), nullable=False, comment='Question that was evaluated'),
            sa.Column('question', sa.Text(), nullable=False, comment='The question text (denormalized)'),
            sa.Column('retrieved_contexts', mysql.JSON(), nullable=False, comment='Array of retrieved contexts from retrieval service'),
            sa.Column('expected_context', sa.Text(), nullable=False, comment='Expected context for evaluation'),
            sa.Column('context_precision', sa.Float(), nullable=True, comment='Context Precision score (0.0-1.0)'),
            sa.Column('context_recall', sa.Float(), nullable=True, comment='Context Recall score (0.0-1.0)'),
            sa.Column('context_relevancy', sa.Float(), nullable=True, comment='Context Relevancy score (0.0-1.0)'),
            sa.Column('result_metadata', mysql.JSON(), nullable=True, comment='Additional metadata (timing, cache hit, etc.)'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), comment='Result creation timestamp'),
            sa.ForeignKeyConstraint(['question_id'], ['dataset_questions.question_id'], name='fk_evaluation_results_question_id_dataset_questions', ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['run_id'], ['evaluation_runs.run_id'], name='fk_evaluation_results_run_id_evaluation_runs', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('result_id', name='pk_evaluation_results')
        )
        op.create_index('ix_evaluation_results_run_id', 'evaluation_results', ['run_id'])
        op.create_index('ix_evaluation_results_question_id', 'evaluation_results', ['question_id'])
        op.create_index('ix_evaluation_results_created_at', 'evaluation_results', ['created_at'])

    # Create dataset_files junction table
    if 'dataset_files' not in existing_tables:
        op.create_table(
            'dataset_files',
            sa.Column('dataset_id', sa.String(36), nullable=False, comment='Dataset identifier'),
            sa.Column('file_id', sa.String(36), nullable=False, comment='File identifier'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), comment='Link creation timestamp'),
            sa.ForeignKeyConstraint(['dataset_id'], ['evaluation_datasets.dataset_id'], name='fk_dataset_files_dataset_id_evaluation_datasets', ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['file_id'], ['evaluation_files.file_id'], name='fk_dataset_files_file_id_evaluation_files', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('dataset_id', 'file_id')
        )


def downgrade() -> None:
    """Drop all tables."""
    op.drop_table('dataset_files')
    op.drop_table('evaluation_results')
    op.drop_table('evaluation_runs')
    op.drop_table('evaluation_jobs')
    op.drop_table('dataset_questions')
    op.drop_table('evaluation_datasets')
    op.drop_table('evaluation_files')
