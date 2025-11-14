"""
Evaluation Result Schemas.
Pydantic models for result responses.
"""

from datetime import datetime
from pydantic import BaseModel, Field, field_validator, model_validator


class ResultDetailResponse(BaseModel):
    """Detailed result for a single question."""
    result_id: str
    run_id: str
    question_id: str
    question_text: str
    expected_context: str
    retrieved_contexts: list[str]
    context_precision: float | None
    context_recall: float | None
    context_relevancy: float | None
    status: str
    error_message: str | None
    metadata: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
    
    @model_validator(mode='before')
    @classmethod
    def map_metadata(cls, data):
        """Map result_metadata to metadata for API compatibility."""
        if isinstance(data, dict):
            if 'result_metadata' in data and 'metadata' not in data:
                data['metadata'] = data.get('result_metadata')
        elif hasattr(data, 'result_metadata'):
            # If it's an ORM object, convert to dict to avoid SQLAlchemy Base.metadata conflict
            # Cannot use setattr on ORM object as 'metadata' conflicts with Base.metadata
            from sqlalchemy.inspection import inspect as sqlalchemy_inspect

            # Convert ORM object to dict using SQLAlchemy inspection
            mapper = sqlalchemy_inspect(data)
            result_dict = {}

            # Get all column values
            for column in mapper.mapper.column_attrs:
                result_dict[column.key] = getattr(data, column.key)

            # Get computed properties
            if hasattr(data, 'status'):
                result_dict['status'] = data.status
            if hasattr(data, 'error_message'):
                result_dict['error_message'] = data.error_message
            if hasattr(data, 'question_text'):
                result_dict['question_text'] = data.question_text

            # Map result_metadata to metadata
            result_dict['metadata'] = result_dict.get('result_metadata')

            return result_dict
        return data


class ResultListItem(BaseModel):
    """Summary item for result list."""
    result_id: str
    question_id: str
    question_text: str  # Preview (first 100 chars)
    context_precision: float | None
    context_recall: float | None
    context_relevancy: float | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ResultListResponse(BaseModel):
    """Paginated list of results."""
    items: list[ResultListItem]
    total: int
    page: int
    limit: int
    pages: int


class ExportFormat(BaseModel):
    """Export format options."""
    format: str = Field(..., pattern="^(csv|json)$")
    type: str = Field(default="detailed", pattern="^(summary|detailed)$")
