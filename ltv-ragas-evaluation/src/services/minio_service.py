"""
MinIO service for file storage operations.
Handles upload, download, and deletion of evaluation files.
"""

from datetime import timedelta
from typing import BinaryIO
from minio import Minio
from minio.error import S3Error

from src.config.settings import get_settings
from src.utils.logger import logger


class MinIOService:
    """Service for interacting with MinIO object storage."""

    def __init__(self) -> None:
        """Initialize MinIO client."""
        settings = get_settings()

        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure
        )

        self.bucket_name = settings.minio_bucket_evaluation
        self.presigned_url_expiry_hours = settings.minio_presigned_url_expiry_hours

        # Ensure bucket exists
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self) -> None:
        """Create the evaluation bucket if it doesn't exist."""
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info(f"Created MinIO bucket: {self.bucket_name}")
            else:
                logger.info(f"MinIO bucket exists: {self.bucket_name}")
        except S3Error as e:
            logger.error(f"Failed to ensure bucket exists: {e}")
            raise

    def upload_file(
        self,
        object_name: str,
        file_data: BinaryIO,
        file_size: int,
        content_type: str
    ) -> str:
        """
        Upload a file to MinIO.

        Args:
            object_name: Name of the object in MinIO
            file_data: File data stream
            file_size: Size of the file in bytes
            content_type: MIME type of the file

        Returns:
            Object name in MinIO

        Raises:
            S3Error: If upload fails
        """
        try:
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                data=file_data,
                length=file_size,
                content_type=content_type
            )

            logger.info(f"Uploaded file to MinIO: {object_name}")
            return object_name

        except S3Error as e:
            logger.error(f"Failed to upload file to MinIO: {e}")
            raise

    def delete_file(self, object_name: str) -> None:
        """
        Delete a file from MinIO.

        Args:
            object_name: Name of the object to delete

        Raises:
            S3Error: If deletion fails
        """
        try:
            self.client.remove_object(
                bucket_name=self.bucket_name,
                object_name=object_name
            )

            logger.info(f"Deleted file from MinIO: {object_name}")

        except S3Error as e:
            logger.error(f"Failed to delete file from MinIO: {e}")
            raise

    def get_presigned_url(self, object_name: str) -> str:
        """
        Generate a presigned URL for downloading a file.

        Args:
            object_name: Name of the object

        Returns:
            Presigned URL valid for configured expiry time

        Raises:
            S3Error: If URL generation fails
        """
        try:
            url = self.client.presigned_get_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                expires=timedelta(hours=self.presigned_url_expiry_hours)
            )

            logger.info(f"Generated presigned URL for: {object_name}")
            return url

        except S3Error as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            raise

    def file_exists(self, object_name: str) -> bool:
        """
        Check if a file exists in MinIO.

        Args:
            object_name: Name of the object

        Returns:
            True if file exists, False otherwise
        """
        try:
            self.client.stat_object(
                bucket_name=self.bucket_name,
                object_name=object_name
            )
            return True
        except S3Error:
            return False


# Global MinIO service instance
_minio_service: MinIOService | None = None


def get_minio_service() -> MinIOService:
    """Get or create the global MinIO service instance."""
    global _minio_service
    if _minio_service is None:
        _minio_service = MinIOService()
    return _minio_service
