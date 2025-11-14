"""
Dataset Question model for storing evaluation questions.
"""

from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Text, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.mysql import JSON

from src.models.base import Base, generate_uuid, utcnow


class DatasetQuestion(Base):
    """Model for questions within an evaluation dataset."""

    __tablename__ = "dataset_questions"

    # Primary Key
    question_id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=generate_uuid,
        comment="Unique question identifier"
    )

    # Foreign Keys
    dataset_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("evaluation_datasets.dataset_id", ondelete="CASCADE"),
        nullable=False,
        comment="Dataset this question belongs to"
    )

    # Question Content
    question: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="The question text"
    )

    expected_context: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Expected context/answer for evaluation"
    )

    # Ordering (CRITICAL for sequential testing)
    order_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Order index for sequential testing"
    )

    # Additional Metadata
    question_metadata: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Additional metadata (JSON)"
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

    # Indexes and Constraints
    __table_args__ = (
        Index("ix_dataset_questions_dataset_id", "dataset_id"),
        Index("ix_dataset_questions_order_index", "order_index"),
        UniqueConstraint("dataset_id", "order_index", name="uq_dataset_question_order"),
    )

    def __repr__(self) -> str:
        question_preview = self.question[:50] if len(self.question) > 50 else self.question
        return f"<DatasetQuestion(question_id={self.question_id}, order={self.order_index}, question='{question_preview}...')>"
