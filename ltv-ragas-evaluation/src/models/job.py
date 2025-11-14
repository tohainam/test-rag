"""
Evaluation Job model for tracking async evaluation jobs.
"""

from datetime import datetime
from typing import Literal
from sqlalchemy import String, Integer, DateTime, Enum, Text, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.mysql import JSON

from src.models.base import Base, generate_uuid, utcnow


JobStatus = Literal["pending", "processing", "completed", "failed"]


class EvaluationJob(Base):
    """Model for tracking evaluation job status and progress."""

    __tablename__ = "evaluation_jobs"

    # Primary Key
    job_id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=generate_uuid,
        comment="Unique job identifier"
    )

    # Job Status
    status: Mapped[str] = mapped_column(
        Enum("pending", "processing", "completed", "failed", name="job_status_enum"),
        nullable=False,
        default="pending",
        comment="Current job status"
    )

    phase: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="Current phase (e.g., 'validating', 'testing_questions')"
    )

    progress_percent: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Progress percentage (0-100)"
    )

    current_step: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Current step description (e.g., 'Testing question 35/100')"
    )

    # Configuration
    config: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Job configuration (JSON)"
    )

    # User Information
    created_by_user_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="User ID who created the job"
    )

    # Error Information
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Error message if job failed"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        comment="Job creation timestamp"
    )

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Job start timestamp"
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Job completion timestamp"
    )

    # Indexes
    __table_args__ = (
        Index("ix_evaluation_jobs_status", "status"),
        Index("ix_evaluation_jobs_created_by", "created_by_user_id"),
        Index("ix_evaluation_jobs_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<EvaluationJob(job_id={self.job_id}, status={self.status}, progress={self.progress_percent}%)>"
