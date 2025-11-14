"""
Dataset Management API endpoints.
Handles CRUD operations for evaluation datasets.
"""

from flask import Blueprint, request, jsonify, Response
from sqlalchemy import select, func
from pydantic import ValidationError

from src.models.base import get_db_session
from src.models.dataset import EvaluationDataset
from src.models.dataset_file import DatasetFile
from src.services.dataset_service import DatasetService
from src.schemas.dataset import (
    DatasetCreateRequest,
    DatasetUpdateRequest,
    DatasetResponse,
    DatasetListResponse,
    DatasetListItem,
    DatasetDetailResponse,
    DatasetDeleteResponse,
)
from src.schemas.question import QuestionResponse
from src.schemas.file import FileListItem
from src.utils.logger import logger

datasets_bp = Blueprint('datasets', __name__, url_prefix='/evaluation/datasets')


@datasets_bp.route('', methods=['POST'])
def create_dataset() -> tuple[Response, int]:
    """
    Create a new evaluation dataset.

    Returns:
        JSON response with created dataset
    """
    # Get user ID from header
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return jsonify({'error': 'Unauthorized', 'message': 'User ID not found'}), 401

    try:
        # Parse and validate request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'BadRequest', 'message': 'Request body is required'}), 400

        req = DatasetCreateRequest(**data)

        # Create dataset
        db = get_db_session()
        try:
            dataset = DatasetService.create_dataset(
                db=db,
                name=req.name,
                source=req.source,
                created_by_user_id=int(user_id),
                description=req.description,
                file_ids=req.file_ids
            )

            # Trigger question generation if source is llm_generated and files provided
            job_id = None
            if req.source == 'llm_generated' and req.file_ids and len(req.file_ids) > 0:
                try:
                    job_id, total_files = DatasetService.trigger_question_generation(
                        db=db,
                        dataset_id=dataset.dataset_id,
                        file_ids=None,  # Process all linked files
                        config=None
                    )
                    logger.info(
                        f"Triggered question generation job {job_id} for dataset {dataset.dataset_id}"
                    )
                except Exception as gen_error:
                    logger.error(
                        f"Failed to trigger question generation: {str(gen_error)}",
                        exc_info=True
                    )
                    # Don't fail dataset creation, just log the error

            # Prepare response
            response = DatasetResponse.model_validate(dataset)
            response_dict = response.model_dump(mode='json')

            # Add generation job_id to response if triggered
            if job_id:
                response_dict['generation_job_id'] = job_id

            return jsonify(response_dict), 201

        finally:
            db.close()

    except ValidationError as e:
        return jsonify({'error': 'BadRequest', 'message': str(e)}), 400
    except Exception as e:
        logger.error(f"Failed to create dataset: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to create dataset'}), 500


@datasets_bp.route('', methods=['GET'])
def list_datasets() -> tuple[Response, int]:
    """
    List all datasets with pagination and filtering.

    Query params:
        - page: Page number (default: 1)
        - limit: Items per page (default: 20)
        - source: Filter by source ('manual' or 'llm_generated')
        - created_by: Filter by user ID
        - search: Search in dataset name

    Returns:
        JSON response with paginated dataset list
    """
    # Parse query parameters
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    source = request.args.get('source', type=str)
    created_by = request.args.get('created_by', type=int)
    search = request.args.get('search', type=str)

    # Validate parameters
    if page < 1:
        page = 1
    if limit < 1 or limit > 100:
        limit = 20

    try:
        db = get_db_session()
        try:
            # Build query
            query = select(EvaluationDataset)

            # Apply filters
            if source:
                query = query.where(EvaluationDataset.source == source)
            if created_by:
                query = query.where(EvaluationDataset.created_by_user_id == created_by)
            if search:
                query = query.where(EvaluationDataset.name.contains(search))

            # Order by creation date (newest first)
            query = query.order_by(EvaluationDataset.created_at.desc())

            # Get total count
            count_query = select(func.count()).select_from(query.subquery())
            total = db.execute(count_query).scalar() or 0

            # Calculate pagination
            pages = (total + limit - 1) // limit if total > 0 else 1
            offset = (page - 1) * limit

            # Get paginated results
            query = query.offset(offset).limit(limit)
            datasets = db.execute(query).scalars().all()

            # Calculate file_count for each dataset
            dataset_ids = [d.dataset_id for d in datasets]
            file_counts = {}
            if dataset_ids:
                file_count_query = (
                    select(DatasetFile.dataset_id, func.count(DatasetFile.file_id).label('count'))
                    .where(DatasetFile.dataset_id.in_(dataset_ids))
                    .group_by(DatasetFile.dataset_id)
                )
                results = db.execute(file_count_query).all()
                file_counts = {row.dataset_id: row.count for row in results}

            # Get active generation jobs (pending or processing) for each dataset
            from src.models.generation_job import QuestionGenerationJob, GenerationStatus
            generation_jobs = {}
            if dataset_ids:
                gen_job_query = (
                    select(QuestionGenerationJob)
                    .where(
                        QuestionGenerationJob.dataset_id.in_(dataset_ids),
                        QuestionGenerationJob.status.in_([GenerationStatus.pending, GenerationStatus.processing])
                    )
                    .order_by(QuestionGenerationJob.created_at.desc())
                )
                jobs = db.execute(gen_job_query).scalars().all()
                for job in jobs:
                    if job.dataset_id not in generation_jobs:  # Keep only the most recent job
                        generation_jobs[job.dataset_id] = job

            # Prepare response items with file_count and generation_job
            items = []
            for dataset in datasets:
                item_dict = DatasetListItem.model_validate(dataset).model_dump()
                item_dict['file_count'] = file_counts.get(dataset.dataset_id, 0)
                # Add generation job info if exists
                if dataset.dataset_id in generation_jobs:
                    job = generation_jobs[dataset.dataset_id]
                    item_dict['generation_job'] = {
                        'job_id': job.job_id,
                        'status': job.status.value,
                        'progress_percent': job.progress_percent,
                        'processed_files': job.processed_files,
                        'total_files': job.total_files,
                        'total_questions_generated': job.total_questions_generated,
                    }
                items.append(DatasetListItem(**item_dict))
            response = DatasetListResponse(
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
        logger.error(f"Failed to list datasets: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to list datasets'}), 500


@datasets_bp.route('/<dataset_id>', methods=['GET'])
def get_dataset(dataset_id: str) -> tuple[Response, int]:
    """
    Get dataset details with all questions and linked files.

    Args:
        dataset_id: Dataset identifier

    Returns:
        JSON response with dataset details
    """
    try:
        db = get_db_session()
        try:
            # Get dataset with details
            details = DatasetService.get_dataset_with_details(db, dataset_id)

            if not details:
                return jsonify({'error': 'NotFound', 'message': 'Dataset not found'}), 404

            # Prepare response
            dataset_response = DatasetResponse.model_validate(details['dataset'])
            questions_response = [QuestionResponse.model_validate(q) for q in details['questions']]
            files_response = [FileListItem.model_validate(f) for f in details['files']]

            response = DatasetDetailResponse(
                dataset=dataset_response,
                questions=[q.model_dump(mode='json') for q in questions_response],
                files=[f.model_dump(mode='json') for f in files_response]
            )

            return jsonify(response.model_dump(mode='json')), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to get dataset: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to get dataset'}), 500


@datasets_bp.route('/<dataset_id>', methods=['PATCH'])
def update_dataset(dataset_id: str) -> tuple[Response, int]:
    """
    Update a dataset.

    Args:
        dataset_id: Dataset identifier

    Returns:
        JSON response with updated dataset
    """
    try:
        # Parse and validate request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'BadRequest', 'message': 'Request body is required'}), 400

        req = DatasetUpdateRequest(**data)

        # Update dataset
        db = get_db_session()
        try:
            dataset = DatasetService.update_dataset(
                db=db,
                dataset_id=dataset_id,
                name=req.name,
                description=req.description
            )

            if not dataset:
                return jsonify({'error': 'NotFound', 'message': 'Dataset not found'}), 404

            # Prepare response
            response = DatasetResponse.model_validate(dataset)
            return jsonify(response.model_dump(mode='json')), 200

        finally:
            db.close()

    except ValidationError as e:
        return jsonify({'error': 'BadRequest', 'message': str(e)}), 400
    except Exception as e:
        logger.error(f"Failed to update dataset: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to update dataset'}), 500


@datasets_bp.route('/<dataset_id>', methods=['DELETE'])
def delete_dataset(dataset_id: str) -> tuple[Response, int]:
    """
    Delete a dataset and all related data (cascade).
    Requires confirmation query parameter.

    Args:
        dataset_id: Dataset identifier

    Query params:
        - confirm: Must be 'true' to proceed

    Returns:
        JSON response with deletion status
    """
    # Check for confirmation
    confirm = request.args.get('confirm', type=str)
    if confirm != 'true':
        return jsonify({
            'error': 'BadRequest',
            'message': 'Deletion requires confirmation. Add ?confirm=true'
        }), 400

    try:
        db = get_db_session()
        try:
            # Delete dataset
            deleted_count = DatasetService.delete_dataset(db, dataset_id)

            if not deleted_count:
                return jsonify({'error': 'NotFound', 'message': 'Dataset not found'}), 404

            # Prepare response
            response = DatasetDeleteResponse(
                success=True,
                deleted_count=deleted_count
            )

            return jsonify(response.model_dump()), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to delete dataset: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to delete dataset'}), 500


@datasets_bp.route('/<dataset_id>/files', methods=['POST'])
def add_files_to_dataset(dataset_id: str) -> tuple[Response, int]:
    """
    Add files to a dataset.

    Request body:
        {
            "file_ids": ["file-id-1", "file-id-2"]
        }

    Args:
        dataset_id: Dataset identifier

    Returns:
        JSON response with updated dataset
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'BadRequest', 'message': 'Request body is required'}), 400

        file_ids = data.get('file_ids', [])
        if not isinstance(file_ids, list) or len(file_ids) == 0:
            return jsonify({'error': 'BadRequest', 'message': 'file_ids must be a non-empty array'}), 400

        db = get_db_session()
        try:
            dataset = DatasetService.add_files_to_dataset(
                db=db,
                dataset_id=dataset_id,
                file_ids=file_ids
            )

            if not dataset:
                return jsonify({'error': 'NotFound', 'message': 'Dataset not found'}), 404

            # Trigger question generation if source is llm_generated
            job_id = None
            if dataset.source == 'llm_generated':
                try:
                    job_id, total_files = DatasetService.trigger_question_generation(
                        db=db,
                        dataset_id=dataset_id,
                        file_ids=file_ids,  # Only process newly added files
                        config=None
                    )
                    logger.info(
                        f"Triggered question generation job {job_id} for {total_files} new files"
                    )
                except Exception as gen_error:
                    logger.error(
                        f"Failed to trigger question generation: {str(gen_error)}",
                        exc_info=True
                    )
                    # Don't fail the file addition, just log the error

            response = DatasetResponse.model_validate(dataset)
            response_dict = response.model_dump(mode='json')

            # Add generation job_id to response if triggered
            if job_id:
                response_dict['generation_job_id'] = job_id

            return jsonify(response_dict), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to add files to dataset: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to add files to dataset'}), 500


@datasets_bp.route('/<dataset_id>/files/<file_id>', methods=['DELETE'])
def remove_file_from_dataset(dataset_id: str, file_id: str) -> tuple[Response, int]:
    """
    Remove a file from a dataset.

    Args:
        dataset_id: Dataset identifier
        file_id: File identifier

    Returns:
        JSON response with success status
    """
    try:
        db = get_db_session()
        try:
            removed = DatasetService.remove_file_from_dataset(
                db=db,
                dataset_id=dataset_id,
                file_id=file_id
            )

            if not removed:
                return jsonify({'error': 'NotFound', 'message': 'Dataset or file link not found'}), 404

            return jsonify({'success': True, 'message': 'File removed from dataset'}), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to remove file from dataset: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to remove file from dataset'}), 500
