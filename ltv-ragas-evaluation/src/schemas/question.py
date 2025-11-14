"""
Pydantic schemas for question management.
"""

from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict, field_validator


class QuestionInput(BaseModel):
    """Schema for a single question input."""

    question: str = Field(..., min_length=1, description="Question text")
    expected_context: str = Field(..., min_length=1, description="Expected context/answer")
    metadata: dict | None = Field(None, description="Optional metadata")

    @field_validator("question", "expected_context")
    @classmethod
    def validate_not_empty(cls, v: str) -> str:
        """Validate fields are not empty."""
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()


class QuestionBulkAddRequest(BaseModel):
    """Request schema for bulk adding questions."""

    questions: list[QuestionInput] = Field(..., min_length=1, description="List of questions to add")

    @field_validator("questions")
    @classmethod
    def validate_questions_not_empty(cls, v: list[QuestionInput]) -> list[QuestionInput]:
        """Validate questions list is not empty."""
        if not v:
            raise ValueError("At least one question is required")
        return v


class QuestionUpdateRequest(BaseModel):
    """Request schema for updating a question."""

    question: str | None = Field(None, min_length=1, description="Question text")
    expected_context: str | None = Field(None, min_length=1, description="Expected context/answer")
    metadata: dict | None = Field(None, description="Optional metadata")

    @field_validator("question", "expected_context")
    @classmethod
    def validate_not_empty(cls, v: str | None) -> str | None:
        """Validate fields are not empty if provided."""
        if v is not None:
            if not v.strip():
                raise ValueError("Field cannot be empty")
            return v.strip()
        return v


class QuestionResponse(BaseModel):
    """Response schema for a question."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    question_id: str
    dataset_id: str
    question: str
    expected_context: str
    order_index: int
    metadata: dict | None = Field(None, validation_alias="question_metadata", serialization_alias="metadata")
    created_at: datetime
    updated_at: datetime


class QuestionBulkAddResponse(BaseModel):
    """Response schema for bulk question addition."""

    success: bool
    questions: list[QuestionResponse]
    added_count: int


class QuestionReorderItem(BaseModel):
    """Schema for a single reorder item."""

    question_id: str = Field(..., description="Question ID")
    order_index: int = Field(..., ge=0, description="New order index (>= 0)")


class QuestionReorderRequest(BaseModel):
    """Request schema for reordering questions."""

    question_orders: list[QuestionReorderItem] = Field(
        ...,
        min_length=1,
        description="List of question IDs with new order indices"
    )

    @field_validator("question_orders")
    @classmethod
    def validate_no_duplicate_indices(cls, v: list[QuestionReorderItem]) -> list[QuestionReorderItem]:
        """Validate no duplicate order indices."""
        indices = [item.order_index for item in v]
        if len(indices) != len(set(indices)):
            raise ValueError("Order indices must be unique")
        return v


class QuestionDeleteResponse(BaseModel):
    """Response schema for question deletion."""

    success: bool
    message: str = Field(..., description="Success message")
