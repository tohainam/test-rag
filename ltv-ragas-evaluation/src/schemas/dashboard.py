"""
Dashboard Schemas.
Pydantic models for dashboard API responses.
"""

from datetime import datetime
from pydantic import BaseModel


class DashboardLatestResponse(BaseModel):
    """Response for latest completed run."""
    run_id: str
    dataset_id: str
    dataset_name: str
    job_id: str
    total_questions: int
    completed_questions: int
    failed_questions: int
    average_scores: dict | None
    statistics: dict | None
    processing_time_ms: int | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class MetricStatistics(BaseModel):
    """Statistics for a single metric."""
    mean: float
    median: float
    std_dev: float
    min: float
    max: float
    count: int


class RunOverviewResponse(BaseModel):
    """Comprehensive run overview with metrics."""
    run_id: str
    dataset_id: str
    dataset_name: str
    job_id: str

    # Counts
    total_questions: int
    completed_questions: int
    failed_questions: int
    success_rate: float  # percentage

    # Average scores
    avg_context_precision: float
    avg_context_recall: float
    avg_context_relevancy: float
    overall_score: float  # average of all three

    # Statistics
    precision_stats: MetricStatistics | None
    recall_stats: MetricStatistics | None
    relevancy_stats: MetricStatistics | None

    # Timing
    processing_time_ms: int | None
    avg_time_per_question_ms: int | None

    # Timestamps
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}
