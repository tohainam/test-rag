"""
Question Management API endpoints.
Handles question CRUD operations, bulk addition, and reordering.
"""

from flask import Blueprint, request, jsonify, Response
from pydantic import ValidationError

from src.models.base import get_db_session
from src.services.question_service import QuestionService
from src.schemas.question import (
    QuestionBulkAddRequest,
    QuestionBulkAddResponse,
    QuestionUpdateRequest,
    QuestionResponse,
    QuestionReorderRequest,
    QuestionDeleteResponse,
)
from src.utils.logger import logger

questions_bp = Blueprint('questions', __name__, url_prefix='/evaluation')


@questions_bp.route('/datasets/<dataset_id>/questions/bulk', methods=['POST'])
def bulk_add_questions(dataset_id: str) -> tuple[Response, int]:
    """
    Add multiple questions to a dataset.

    Args:
        dataset_id: Dataset identifier

    Returns:
        JSON response with added questions
    """
    try:
        # Parse and validate request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'BadRequest', 'message': 'Request body is required'}), 400

        req = QuestionBulkAddRequest(**data)

        # Prepare questions data
        questions_data = [
            {
                'question': q.question,
                'expected_context': q.expected_context,
                'metadata': q.metadata
            }
            for q in req.questions
        ]

        # Add questions
        db = get_db_session()
        try:
            questions = QuestionService.bulk_add_questions(
                db=db,
                dataset_id=dataset_id,
                questions_data=questions_data
            )

            # Prepare response
            questions_response = [QuestionResponse.model_validate(q) for q in questions]
            response = QuestionBulkAddResponse(
                success=True,
                questions=questions_response,
                added_count=len(questions)
            )

            return jsonify(response.model_dump(mode='json')), 201

        finally:
            db.close()

    except ValidationError as e:
        return jsonify({'error': 'BadRequest', 'message': str(e)}), 400
    except Exception as e:
        logger.error(f"Failed to add questions: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to add questions'}), 500


@questions_bp.route('/questions/<question_id>', methods=['PATCH'])
def update_question(question_id: str) -> tuple[Response, int]:
    """
    Update a question.

    Args:
        question_id: Question identifier

    Returns:
        JSON response with updated question
    """
    try:
        # Parse and validate request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'BadRequest', 'message': 'Request body is required'}), 400

        req = QuestionUpdateRequest(**data)

        # Update question
        db = get_db_session()
        try:
            question = QuestionService.update_question(
                db=db,
                question_id=question_id,
                question=req.question,
                expected_context=req.expected_context,
                metadata=req.metadata
            )

            if not question:
                return jsonify({'error': 'NotFound', 'message': 'Question not found'}), 404

            # Prepare response
            response = QuestionResponse.model_validate(question)
            return jsonify(response.model_dump(mode='json')), 200

        finally:
            db.close()

    except ValidationError as e:
        return jsonify({'error': 'BadRequest', 'message': str(e)}), 400
    except Exception as e:
        logger.error(f"Failed to update question: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to update question'}), 500


@questions_bp.route('/questions/<question_id>', methods=['DELETE'])
def delete_question(question_id: str) -> tuple[Response, int]:
    """
    Delete a question and re-order remaining questions.

    Args:
        question_id: Question identifier

    Returns:
        JSON response with deletion status
    """
    try:
        db = get_db_session()
        try:
            # Delete question
            success = QuestionService.delete_question(db, question_id)

            if not success:
                return jsonify({'error': 'NotFound', 'message': 'Question not found'}), 404

            # Prepare response
            response = QuestionDeleteResponse(
                success=True,
                message='Question deleted and remaining questions reordered successfully'
            )

            return jsonify(response.model_dump()), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to delete question: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to delete question'}), 500


@questions_bp.route('/datasets/<dataset_id>/questions/reorder', methods=['POST'])
def reorder_questions(dataset_id: str) -> tuple[Response, int]:
    """
    Reorder questions in a dataset.

    Args:
        dataset_id: Dataset identifier

    Returns:
        JSON response with reorder status
    """
    try:
        # Parse and validate request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'BadRequest', 'message': 'Request body is required'}), 400

        req = QuestionReorderRequest(**data)

        # Prepare reorder data
        question_orders = [
            {
                'question_id': item.question_id,
                'order_index': item.order_index
            }
            for item in req.question_orders
        ]

        # Validate reorder request
        db = get_db_session()
        try:
            is_valid, error_msg = QuestionService.validate_question_orders(
                db, dataset_id, question_orders
            )

            if not is_valid:
                return jsonify({'error': 'BadRequest', 'message': error_msg}), 400

            # Reorder questions
            success = QuestionService.reorder_questions(
                db, dataset_id, question_orders
            )

            if not success:
                return jsonify({'error': 'InternalServerError', 'message': 'Failed to reorder questions'}), 500

            return jsonify({
                'success': True,
                'message': 'Questions reordered successfully'
            }), 200

        finally:
            db.close()

    except ValidationError as e:
        return jsonify({'error': 'BadRequest', 'message': str(e)}), 400
    except Exception as e:
        logger.error(f"Failed to reorder questions: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to reorder questions'}), 500
