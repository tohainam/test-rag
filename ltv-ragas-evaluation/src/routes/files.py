"""
File Management API endpoints for evaluation system.
Handles upload, list, delete, and download operations.
"""

import uuid
from flask import Blueprint, request, jsonify, Response
from werkzeug.utils import secure_filename
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from src.models.base import get_db_session
from src.models.file import EvaluationFile
from src.models.dataset_file import DatasetFile
from src.models.dataset import EvaluationDataset
from src.services.minio_service import get_minio_service
from src.schemas.file import (
    FileUploadResponse,
    FileListResponse,
    FileListItem,
    FileDownloadResponse,
    FileDeleteResponse,
)
from src.utils.logger import logger
from src.utils.validators import (
    validate_file_extension,
    validate_file_size,
    get_content_type,
)

files_bp = Blueprint('files', __name__, url_prefix='/evaluation/files')


@files_bp.route('/upload', methods=['POST'])
def upload_file() -> tuple[Response, int]:
    """
    Upload a file to MinIO and store metadata.

    Returns:
        JSON response with file metadata
    """
    # Get user ID from header (set by API Gateway)
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return jsonify({'error': 'Unauthorized', 'message': 'User ID not found'}), 401

    # Check if file is in request
    if 'file' not in request.files:
        return jsonify({'error': 'BadRequest', 'message': 'No file provided'}), 400

    file = request.files['file']

    # Check if filename is empty
    if file.filename == '':
        return jsonify({'error': 'BadRequest', 'message': 'No file selected'}), 400

    # Validate file extension
    is_valid, error_msg = validate_file_extension(file.filename)
    if not is_valid:
        return jsonify({'error': 'BadRequest', 'message': error_msg}), 400

    # Read file data to get size
    file.seek(0, 2)  # Seek to end
    file_size = file.tell()
    file.seek(0)  # Seek back to start

    # Validate file size
    is_valid, error_msg = validate_file_size(file_size)
    if not is_valid:
        return jsonify({'error': 'BadRequest', 'message': error_msg}), 400

    try:
        # Generate unique object name
        file_id = str(uuid.uuid4())
        original_filename = secure_filename(file.filename)
        file_extension = '.' + original_filename.rsplit('.', 1)[1].lower()
        minio_object_name = f"{file_id}{file_extension}"

        # Get content type
        content_type = get_content_type(original_filename) or 'application/octet-stream'

        # Upload to MinIO
        minio_service = get_minio_service()
        minio_service.upload_file(
            object_name=minio_object_name,
            file_data=file.stream,
            file_size=file_size,
            content_type=content_type
        )

        # Save metadata to database
        db = get_db_session()
        try:
            eval_file = EvaluationFile(
                file_id=file_id,
                filename=original_filename,
                original_filename=original_filename,
                content_type=content_type,
                filesize=file_size,
                minio_bucket='evaluation',
                minio_object_name=minio_object_name,
                uploaded_by_user_id=int(user_id)
            )

            db.add(eval_file)
            db.commit()
            db.refresh(eval_file)

            logger.info(f"File uploaded successfully: {file_id}")

            # Prepare response
            response_data = FileUploadResponse.model_validate(eval_file)
            return jsonify(response_data.model_dump(mode='json')), 201

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to upload file: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to upload file'}), 500


@files_bp.route('', methods=['GET'])
def list_files() -> tuple[Response, int]:
    """
    List all uploaded files with pagination and filtering.

    Query params:
        - page: Page number (default: 1)
        - limit: Items per page (default: 20)
        - uploaded_by: Filter by user ID
        - content_type: Filter by content type

    Returns:
        JSON response with paginated file list
    """
    # Parse query parameters
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    uploaded_by = request.args.get('uploaded_by', type=int)
    content_type_filter = request.args.get('content_type', type=str)

    # Validate parameters
    if page < 1:
        page = 1
    if limit < 1 or limit > 100:
        limit = 20

    try:
        db = get_db_session()
        try:
            # Build query
            query = select(EvaluationFile)

            # Apply filters
            if uploaded_by:
                query = query.where(EvaluationFile.uploaded_by_user_id == uploaded_by)
            if content_type_filter:
                query = query.where(EvaluationFile.content_type == content_type_filter)

            # Order by creation date (newest first)
            query = query.order_by(EvaluationFile.created_at.desc())

            # Get total count
            count_query = select(func.count()).select_from(query.subquery())
            total = db.execute(count_query).scalar() or 0

            # Calculate pagination
            pages = (total + limit - 1) // limit if total > 0 else 1
            offset = (page - 1) * limit

            # Get paginated results
            query = query.offset(offset).limit(limit)
            files = db.execute(query).scalars().all()

            # Prepare response
            items = [FileListItem.model_validate(f) for f in files]
            response = FileListResponse(
                items=items,
                total=total,
                page=page,
                limit=limit,
                pages=pages
            )

            return jsonify(response.model_dump(mode='json')), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to list files: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to list files'}), 500


@files_bp.route('/<file_id>/download', methods=['GET'])
def download_file(file_id: str) -> tuple[Response, int]:
    """
    Generate a presigned URL for downloading a file.

    Args:
        file_id: File identifier

    Returns:
        JSON response with download URL
    """
    try:
        db = get_db_session()
        try:
            # Get file from database
            file = db.execute(
                select(EvaluationFile).where(EvaluationFile.file_id == file_id)
            ).scalar_one_or_none()

            if not file:
                return jsonify({'error': 'NotFound', 'message': 'File not found'}), 404

            # Generate presigned URL
            minio_service = get_minio_service()
            download_url = minio_service.get_presigned_url(file.minio_object_name)

            # Prepare response
            response = FileDownloadResponse(
                download_url=download_url,
                expires_in=3600,  # 1 hour in seconds
                filename=file.filename
            )

            logger.info(f"Generated download URL for file: {file_id}")

            return jsonify(response.model_dump()), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to generate download URL: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to generate download URL'}), 500


@files_bp.route('/<file_id>', methods=['DELETE'])
def delete_file(file_id: str) -> tuple[Response, int]:
    """
    Delete a file from MinIO and database.
    Warns if file is used in any datasets.

    Args:
        file_id: File identifier

    Returns:
        JSON response with deletion status
    """
    try:
        db = get_db_session()
        try:
            # Get file from database
            file = db.execute(
                select(EvaluationFile).where(EvaluationFile.file_id == file_id)
            ).scalar_one_or_none()

            if not file:
                return jsonify({'error': 'NotFound', 'message': 'File not found'}), 404

            # Check if file is used in any datasets
            dataset_links = db.execute(
                select(DatasetFile, EvaluationDataset)
                .join(EvaluationDataset, DatasetFile.dataset_id == EvaluationDataset.dataset_id)
                .where(DatasetFile.file_id == file_id)
            ).all()

            if dataset_links:
                # File is in use, return warning
                dataset_names = [link[1].name for link in dataset_links]
                response = FileDeleteResponse(
                    success=False,
                    warning='File is used in datasets and cannot be deleted',
                    datasets=dataset_names
                )
                return jsonify(response.model_dump()), 409  # Conflict

            # Delete from MinIO
            minio_service = get_minio_service()
            minio_service.delete_file(file.minio_object_name)

            # Delete from database
            db.delete(file)
            db.commit()

            logger.info(f"File deleted successfully: {file_id}")

            response = FileDeleteResponse(success=True)
            return jsonify(response.model_dump()), 200

        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to delete file: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to delete file'}), 500
