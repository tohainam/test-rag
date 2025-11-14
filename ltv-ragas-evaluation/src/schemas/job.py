"""
Job Management Schemas.
Pydantic models for job creation and status tracking.
"""

from datetime import datetime
from pydantic import BaseModel, Field


class JobCreateRequest(BaseModel):
    """Request to create a new evaluation job."""
    dataset_id: str = Field(..., description="ID of the dataset to evaluate")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of contexts to retrieve per question")
    metadata: dict | None = Field(default=None, description="Optional metadata for the job")

    model_config = {
        "json_schema_extra": {
            "example": {
                "dataset_id": "550e8400-e29b-41d4-a716-446655440000",
                "top_k": 5,
                "metadata": {"description": "Testing new retrieval model"}
            }
        }
    }


class JobCreateResponse(BaseModel):
    """Response after creating an evaluation job."""
    job_id: str
    run_id: str
    dataset_id: str
    status: str
    created_at: datetime
    message: str

    model_config = {"from_attributes": True}


class JobStatusResponse(BaseModel):
    """Response with job status and progress."""
    job_id: str
    run_id: str
    status: str
    progress_percent: int
    current_step: str | None
    total_questions: int
    completed_questions: int
    failed_questions: int
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None

    # Run statistics (only available when completed)
    average_scores: dict | None = None
    statistics: dict | None = None
    processing_time_ms: int | None = None

    model_config = {"from_attributes": True}


class JobListItem(BaseModel):
    """Summary item for job list."""
    job_id: str
    run_id: str
    dataset_id: str
    dataset_name: str
    status: str
    progress_percent: int
    total_questions: int
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    """Paginated list of jobs."""
    items: list[JobListItem]
    total: int
    page: int
    limit: int
    pages: int
