"""
Pydantic schemas for dataset management.
"""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator


class DatasetCreateRequest(BaseModel):
    """Request schema for creating a dataset."""

    name: str = Field(..., min_length=1, max_length=255, description="Dataset name")
    description: str | None = Field(None, description="Dataset description")
    source: Literal["manual", "llm_generated"] = Field(..., description="Dataset source type")
    file_ids: list[str] | None = Field(None, description="Optional file IDs to link")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate dataset name."""
        if not v or not v.strip():
            raise ValueError("Dataset name cannot be empty")
        return v.strip()


class DatasetUpdateRequest(BaseModel):
    """Request schema for updating a dataset."""

    name: str | None = Field(None, min_length=1, max_length=255, description="Dataset name")
    description: str | None = Field(None, description="Dataset description")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        """Validate dataset name."""
        if v is not None:
            if not v.strip():
                raise ValueError("Dataset name cannot be empty")
            return v.strip()
        return v


class DatasetResponse(BaseModel):
    """Response schema for dataset."""

    model_config = ConfigDict(from_attributes=True)

    dataset_id: str
    name: str
    description: str | None
    source: str
    config: dict | None
    total_questions: int
    created_by_user_id: int
    created_at: datetime
    updated_at: datetime


class DatasetListItem(BaseModel):
    """Schema for dataset in list response."""

    model_config = ConfigDict(from_attributes=True)

    dataset_id: str
    name: str
    source: str
    total_questions: int
    file_count: int = 0
    created_by_user_id: int
    created_at: datetime
    generation_job: dict | None = None


class DatasetListResponse(BaseModel):
    """Response schema for dataset list."""

    items: list[DatasetListItem]
    total: int
    page: int
    limit: int
    pages: int


class DatasetDetailResponse(BaseModel):
    """Response schema for dataset details with questions and files."""

    dataset: DatasetResponse
    questions: list[dict]  # Will be QuestionResponse
    files: list[dict]  # Will be FileListItem


class DatasetDeleteResponse(BaseModel):
    """Response schema for dataset deletion."""

    success: bool
    deleted_count: dict = Field(
        ...,
        description="Count of deleted items",
        example={"dataset": 1, "questions": 50, "runs": 2}
    )
