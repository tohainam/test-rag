"""
Question Generation Job Model

Tracks the status and progress of LLM-based question generation jobs.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, Enum as SQLEnum, ForeignKey, BigInteger
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.mysql import JSON
import enum

from src.models.base import Base


class GenerationStatus(str, enum.Enum):
    """Status of a question generation job"""
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class QuestionGenerationJob(Base):
    """
    Model for tracking question generation jobs.

    When a dataset with source='llm_generated' is created or files are added,
    a generation job is created to process files and generate questions asynchronously.
    """
    __tablename__ = "question_generation_jobs"

    # Primary identification
    job_id = Column(String(36), primary_key=True, index=True)
    dataset_id = Column(
        String(36),
        ForeignKey("evaluation_datasets.dataset_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Job status and progress
    status = Column(
        SQLEnum(GenerationStatus),
        nullable=False,
        default=GenerationStatus.pending,
        index=True
    )
    progress_percent = Column(Float, default=0.0)  # 0.0 to 100.0
    current_file = Column(String(255), nullable=True)  # Current file being processed

    # File processing counters
    total_files = Column(Integer, default=0, nullable=False)
    processed_files = Column(Integer, default=0, nullable=False)
    failed_files = Column(Integer, default=0, nullable=False)

    # Question generation metrics
    total_questions_generated = Column(Integer, default=0, nullable=False)

    # Configuration and metadata
    config = Column(JSON, nullable=True)  # Generation config: temperature, model, etc.
    error_messages = Column(JSON, nullable=True)  # List of error messages for failed files
    file_results = Column(JSON, nullable=True)  # Per-file results: {file_id: {status, questions_count, error}}

    # Timing information
    processing_time_ms = Column(BigInteger, nullable=True)  # Total processing time in milliseconds
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    dataset = relationship("EvaluationDataset", back_populates="generation_jobs")

    def __repr__(self) -> str:
        return f"<QuestionGenerationJob(job_id={self.job_id}, dataset_id={self.dataset_id}, status={self.status})>"

    def to_dict(self) -> dict:
        """Convert model to dictionary"""
        return {
            "job_id": self.job_id,
            "dataset_id": self.dataset_id,
            "status": self.status.value,
            "progress_percent": self.progress_percent,
            "current_file": self.current_file,
            "total_files": self.total_files,
            "processed_files": self.processed_files,
            "failed_files": self.failed_files,
            "total_questions_generated": self.total_questions_generated,
            "config": self.config,
            "error_messages": self.error_messages,
            "file_results": self.file_results,
            "processing_time_ms": self.processing_time_ms,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
