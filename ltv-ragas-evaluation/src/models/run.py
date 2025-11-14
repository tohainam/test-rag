"""
Evaluation Run model for tracking evaluation execution and results.
"""

from datetime import datetime
from typing import Literal
from sqlalchemy import String, Integer, DateTime, Enum, ForeignKey, Index, BigInteger
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.mysql import JSON

from src.models.base import Base, generate_uuid, utcnow


RunStatus = Literal["pending", "running", "completed", "failed"]


class EvaluationRun(Base):
    """Model for evaluation run execution and aggregate results."""

    __tablename__ = "evaluation_runs"

    # Primary Key
    run_id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=generate_uuid,
        comment="Unique run identifier"
    )

    # Foreign Keys
    dataset_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("evaluation_datasets.dataset_id", ondelete="CASCADE"),
        nullable=False,
        comment="Dataset being evaluated"
    )

    job_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("evaluation_jobs.job_id", ondelete="CASCADE"),
        nullable=False,
        comment="Associated job"
    )

    # Run Status
    status: Mapped[str] = mapped_column(
        Enum("pending", "running", "completed", "failed", name="run_status_enum"),
        nullable=False,
        default="pending",
        comment="Current run status"
    )

    # Configuration
    config: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Run configuration (topK, metrics, etc.)"
    )

    # Progress Tracking (CRITICAL for sequential testing)
    total_questions: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Total number of questions to test"
    )

    successful_questions: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Number of successfully tested questions"
    )

    failed_questions: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Number of failed questions"
    )

    current_question_index: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Current question index being tested (for progress)"
    )

    current_question_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="Current question ID being tested"
    )

    # Aggregate Results
    average_scores: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Average scores (precision, recall, relevancy)"
    )

    statistics: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Statistical data (min, max, std, etc.)"
    )

    processing_time_ms: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        comment="Total processing time in milliseconds"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        comment="Run creation timestamp"
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Run completion timestamp"
    )

    # Indexes
    __table_args__ = (
        Index("ix_evaluation_runs_dataset_id", "dataset_id"),
        Index("ix_evaluation_runs_job_id", "job_id"),
        Index("ix_evaluation_runs_created_at", "created_at"),
        Index("ix_evaluation_runs_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<EvaluationRun(run_id={self.run_id}, status={self.status}, progress={self.successful_questions}/{self.total_questions})>"
