"""
Evaluation File model for storing uploaded file metadata.
"""

from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, generate_uuid, utcnow


class EvaluationFile(Base):
    """Model for evaluation file metadata stored in MinIO."""

    __tablename__ = "evaluation_files"

    # Primary Key
    file_id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=generate_uuid,
        comment="Unique file identifier"
    )

    # File Information
    filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Display filename"
    )

    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Original uploaded filename"
    )

    content_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="MIME type of the file"
    )

    filesize: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="File size in bytes"
    )

    # MinIO Storage Information
    minio_bucket: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="evaluation",
        comment="MinIO bucket name"
    )

    minio_object_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Object name in MinIO"
    )

    # User Information
    uploaded_by_user_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="User ID who uploaded the file"
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

    # Indexes
    __table_args__ = (
        Index("ix_evaluation_files_uploaded_by", "uploaded_by_user_id"),
        Index("ix_evaluation_files_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<EvaluationFile(file_id={self.file_id}, filename={self.filename})>"
