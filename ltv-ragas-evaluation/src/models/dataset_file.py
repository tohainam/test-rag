"""
Dataset-File junction table for many-to-many relationship.
"""

from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, PrimaryKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.models.base import Base, utcnow


class DatasetFile(Base):
    """Junction table linking datasets with files."""

    __tablename__ = "dataset_files"

    # Composite Primary Key
    dataset_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("evaluation_datasets.dataset_id", ondelete="CASCADE"),
        nullable=False,
        comment="Dataset identifier"
    )

    file_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("evaluation_files.file_id", ondelete="CASCADE"),
        nullable=False,
        comment="File identifier"
    )

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        comment="Link creation timestamp"
    )

    # Composite Primary Key Constraint
    __table_args__ = (
        PrimaryKeyConstraint("dataset_id", "file_id"),
    )

    def __repr__(self) -> str:
        return f"<DatasetFile(dataset_id={self.dataset_id}, file_id={self.file_id})>"
