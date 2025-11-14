"""
Pydantic schemas for request/response validation.
"""

from src.schemas.file import (
    FileUploadResponse,
    FileListItem,
    FileListResponse,
    FileDownloadResponse,
    FileDeleteResponse,
)

from src.schemas.dataset import (
    DatasetCreateRequest,
    DatasetUpdateRequest,
    DatasetResponse,
    DatasetListItem,
    DatasetListResponse,
    DatasetDetailResponse,
    DatasetDeleteResponse,
)

from src.schemas.question import (
    QuestionInput,
    QuestionBulkAddRequest,
    QuestionUpdateRequest,
    QuestionResponse,
    QuestionBulkAddResponse,
    QuestionReorderItem,
    QuestionReorderRequest,
    QuestionDeleteResponse,
)

__all__ = [
    # File schemas
    "FileUploadResponse",
    "FileListItem",
    "FileListResponse",
    "FileDownloadResponse",
    "FileDeleteResponse",
    # Dataset schemas
    "DatasetCreateRequest",
    "DatasetUpdateRequest",
    "DatasetResponse",
    "DatasetListItem",
    "DatasetListResponse",
    "DatasetDetailResponse",
    "DatasetDeleteResponse",
    # Question schemas
    "QuestionInput",
    "QuestionBulkAddRequest",
    "QuestionUpdateRequest",
    "QuestionResponse",
    "QuestionBulkAddResponse",
    "QuestionReorderItem",
    "QuestionReorderRequest",
    "QuestionDeleteResponse",
]
