"""
Evaluation Result model for storing individual question results.
"""

from datetime import datetime
from sqlalchemy import String, Float, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.mysql import JSON

from src.models.base import Base, generate_uuid, utcnow


class EvaluationResult(Base):
    """Model for storing results of individual question evaluations."""

    __tablename__ = "evaluation_results"

    # Primary Key
    result_id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=generate_uuid,
        comment="Unique result identifier"
    )

    # Foreign Keys
    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("evaluation_runs.run_id", ondelete="CASCADE"),
        nullable=False,
        comment="Evaluation run this result belongs to"
    )

    question_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("dataset_questions.question_id", ondelete="CASCADE"),
        nullable=False,
        comment="Question that was evaluated"
    )

    # Question and Context (denormalized for easier querying)
    question: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="The question text (denormalized)"
    )

    retrieved_contexts: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        comment="Array of retrieved contexts from retrieval service"
    )

    expected_context: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Expected context for evaluation"
    )

    # RAGAS Scores (0.0 to 1.0)
    context_precision: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Context Precision score (0.0-1.0)"
    )

    context_recall: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Context Recall score (0.0-1.0)"
    )

    context_relevancy: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Context Relevancy score (0.0-1.0)"
    )

    # Additional Metadata
    result_metadata: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Additional metadata (timing, cache hit, etc.)"
    )

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        comment="Result creation timestamp"
    )

    # Indexes
    __table_args__ = (
        Index("ix_evaluation_results_run_id", "run_id"),
        Index("ix_evaluation_results_question_id", "question_id"),
        Index("ix_evaluation_results_created_at", "created_at"),
    )

    @property
    def status(self) -> str:
        """Calculate status based on scores and error metadata."""
        # Check if there's an error in metadata
        if self.result_metadata and self.result_metadata.get('error_type'):
            return 'failed'
        # Check if we have scores (completed successfully)
        if (self.context_precision is not None or 
            self.context_recall is not None or 
            self.context_relevancy is not None):
            return 'completed'
        # Default to pending if no scores and no error
        return 'pending'

    @property
    def error_message(self) -> str | None:
        """Extract error message from metadata if present."""
        if self.result_metadata and self.result_metadata.get('error_message'):
            return self.result_metadata.get('error_message')
        return None

    @property
    def question_text(self) -> str:
        """Alias for question field for API compatibility."""
        return self.question

    # Note: Cannot use @property for 'metadata' as it conflicts with Base.metadata
    # Use result_metadata directly or access via get_metadata() method
    def get_metadata(self) -> dict | None:
        """Get result metadata for API compatibility (renamed to avoid conflict with Base.metadata)."""
        return self.result_metadata
    
    # For Pydantic model validation, we'll use a computed field
    # But we need to handle this in the schema instead

    def __repr__(self) -> str:
        question_preview = self.question[:50] if len(self.question) > 50 else self.question
        return f"<EvaluationResult(result_id={self.result_id}, precision={self.context_precision}, recall={self.context_recall}, relevancy={self.context_relevancy})>"
