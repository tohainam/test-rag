"""
Pydantic schemas for file management.
"""

from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class FileUploadResponse(BaseModel):
    """Response schema for file upload."""

    model_config = ConfigDict(from_attributes=True)

    file_id: str = Field(..., description="Unique file identifier")
    filename: str = Field(..., description="Display filename")
    original_filename: str = Field(..., description="Original uploaded filename")
    content_type: str = Field(..., description="MIME type")
    filesize: int = Field(..., description="File size in bytes")
    created_at: datetime = Field(..., description="Upload timestamp")


class FileListItem(BaseModel):
    """Schema for file in list response."""

    model_config = ConfigDict(from_attributes=True)

    file_id: str
    filename: str
    original_filename: str
    content_type: str
    filesize: int
    uploaded_by_user_id: int
    created_at: datetime


class FileListResponse(BaseModel):
    """Response schema for file list."""

    items: list[FileListItem]
    total: int = Field(..., description="Total number of files")
    page: int = Field(..., description="Current page number")
    limit: int = Field(..., description="Items per page")
    pages: int = Field(..., description="Total number of pages")


class FileDownloadResponse(BaseModel):
    """Response schema for file download."""

    download_url: str = Field(..., description="Presigned download URL")
    expires_in: int = Field(..., description="URL expiry time in seconds")
    filename: str = Field(..., description="Filename for download")


class FileDeleteResponse(BaseModel):
    """Response schema for file deletion."""

    success: bool = Field(..., description="Whether deletion was successful")
    warning: str | None = Field(None, description="Warning if file is in use")
    datasets: list[str] | None = Field(None, description="Dataset names using this file")
