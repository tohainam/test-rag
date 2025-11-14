"""
Evaluation Dataset model for managing test datasets.
"""

from datetime import datetime
from typing import Literal, TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, Enum, Text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.mysql import JSON

from src.models.base import Base, generate_uuid, utcnow

if TYPE_CHECKING:
    from src.models.generation_job import QuestionGenerationJob


DatasetSource = Literal["manual", "llm_generated"]


class EvaluationDataset(Base):
    """Model for evaluation datasets containing questions."""

    __tablename__ = "evaluation_datasets"

    # Primary Key
    dataset_id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=generate_uuid,
        comment="Unique dataset identifier"
    )

    # Dataset Information
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Dataset name"
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Dataset description"
    )

    source: Mapped[str] = mapped_column(
        Enum("manual", "llm_generated", name="dataset_source_enum"),
        nullable=False,
        comment="How the dataset was created"
    )

    config: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Dataset configuration (JSON)"
    )

    total_questions: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Total number of questions"
    )

    # User Information
    created_by_user_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="User ID who created the dataset"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        comment="Creation timestamp"
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
        comment="Last update timestamp"
    )

    # Relationships
    generation_jobs: Mapped[list["QuestionGenerationJob"]] = relationship(
        "QuestionGenerationJob",
        back_populates="dataset",
        cascade="all, delete-orphan"
    )

    # Indexes
    __table_args__ = (
        Index("ix_evaluation_datasets_created_by", "created_by_user_id"),
        Index("ix_evaluation_datasets_source", "source"),
        Index("ix_evaluation_datasets_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<EvaluationDataset(dataset_id={self.dataset_id}, name={self.name}, total_questions={self.total_questions})>"
