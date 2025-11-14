"""
Question service layer for business logic.
Handles question CRUD operations and reordering logic.
"""

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from src.models.question import DatasetQuestion
from src.models.dataset import EvaluationDataset
from src.utils.logger import logger


class QuestionService:
    """Service for question management operations."""

    @staticmethod
    def bulk_add_questions(
        db: Session,
        dataset_id: str,
        questions_data: list[dict]
    ) -> list[DatasetQuestion]:
        """
        Add multiple questions to a dataset with auto-assigned order indices.

        Args:
            db: Database session
            dataset_id: Dataset ID
            questions_data: List of question dicts with 'question', 'expected_context', 'metadata'

        Returns:
            List of created questions
        """
        # Get current max order_index
        max_index = db.execute(
            select(func.max(DatasetQuestion.order_index))
            .where(DatasetQuestion.dataset_id == dataset_id)
        ).scalar()

        start_index = (max_index + 1) if max_index is not None else 0

        # Create questions
        questions = []
        for idx, q_data in enumerate(questions_data):
            question = DatasetQuestion(
                dataset_id=dataset_id,
                question=q_data['question'],
                expected_context=q_data['expected_context'],
                metadata=q_data.get('metadata'),
                order_index=start_index + idx
            )
            db.add(question)
            questions.append(question)

        # Update dataset total_questions
        dataset = db.execute(
            select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id)
        ).scalar_one_or_none()

        if dataset:
            dataset.total_questions = db.execute(
                select(func.count()).where(DatasetQuestion.dataset_id == dataset_id)
            ).scalar() or 0
            dataset.total_questions += len(questions)

        db.commit()

        # Refresh all questions
        for q in questions:
            db.refresh(q)

        logger.info(f"Added {len(questions)} questions to dataset {dataset_id}")
        return questions

    @staticmethod
    def update_question(
        db: Session,
        question_id: str,
        question: str | None = None,
        expected_context: str | None = None,
        metadata: dict | None = None
    ) -> DatasetQuestion | None:
        """
        Update a question.

        Args:
            db: Database session
            question_id: Question ID
            question: Optional new question text
            expected_context: Optional new expected context
            metadata: Optional new metadata

        Returns:
            Updated question or None if not found
        """
        q = db.execute(
            select(DatasetQuestion).where(DatasetQuestion.question_id == question_id)
        ).scalar_one_or_none()

        if not q:
            return None

        # Update fields
        if question is not None:
            q.question = question
        if expected_context is not None:
            q.expected_context = expected_context
        if metadata is not None:
            q.question_metadata = metadata

        db.commit()
        db.refresh(q)

        logger.info(f"Updated question: {question_id}")
        return q

    @staticmethod
    def delete_question(db: Session, question_id: str) -> bool:
        """
        Delete a question and re-order remaining questions.

        Args:
            db: Database session
            question_id: Question ID

        Returns:
            True if deleted, False if not found
        """
        # Get question
        question = db.execute(
            select(DatasetQuestion).where(DatasetQuestion.question_id == question_id)
        ).scalar_one_or_none()

        if not question:
            return False

        dataset_id = question.dataset_id
        deleted_index = question.order_index

        # Delete the question
        db.delete(question)
        db.flush()

        # Re-order remaining questions (decrement order_index for all after this one)
        # To avoid unique constraint violations, first move all affected questions to temporary high indices
        remaining_questions = db.execute(
            select(DatasetQuestion)
            .where(DatasetQuestion.dataset_id == dataset_id)
            .where(DatasetQuestion.order_index > deleted_index)
            .order_by(DatasetQuestion.order_index)
        ).scalars().all()

        # Use a large temporary offset to avoid conflicts
        temp_offset = 100000
        for q in remaining_questions:
            q.order_index += temp_offset

        db.flush()

        # Now set the correct final order indices
        for idx, q in enumerate(remaining_questions):
            q.order_index = deleted_index + idx

        # Update dataset total_questions
        dataset = db.execute(
            select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id)
        ).scalar_one_or_none()

        if dataset and dataset.total_questions > 0:
            dataset.total_questions -= 1

        db.commit()

        logger.info(f"Deleted question {question_id} and reordered {len(remaining_questions)} questions")
        return True

    @staticmethod
    def reorder_questions(
        db: Session,
        dataset_id: str,
        question_orders: list[dict]
    ) -> bool:
        """
        Reorder questions in a dataset.

        Args:
            db: Database session
            dataset_id: Dataset ID
            question_orders: List of dicts with 'question_id' and 'order_index'

        Returns:
            True if successful, False otherwise
        """
        # Validate all questions belong to the dataset
        question_ids = [item['question_id'] for item in question_orders]

        questions = db.execute(
            select(DatasetQuestion)
            .where(DatasetQuestion.question_id.in_(question_ids))
            .where(DatasetQuestion.dataset_id == dataset_id)
        ).scalars().all()

        if len(questions) != len(question_orders):
            logger.error(f"Some questions not found or don't belong to dataset {dataset_id}")
            return False

        # Create mapping of question_id to question object
        question_map = {q.question_id: q for q in questions}

        # Update order indices
        for item in question_orders:
            question = question_map.get(item['question_id'])
            if question:
                question.order_index = item['order_index']

        db.commit()

        logger.info(f"Reordered {len(question_orders)} questions in dataset {dataset_id}")
        return True

    @staticmethod
    def validate_question_orders(
        db: Session,
        dataset_id: str,
        question_orders: list[dict]
    ) -> tuple[bool, str | None]:
        """
        Validate question reordering request.

        Args:
            db: Database session
            dataset_id: Dataset ID
            question_orders: List of dicts with 'question_id' and 'order_index'

        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check dataset exists
        dataset = db.execute(
            select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id)
        ).scalar_one_or_none()

        if not dataset:
            return False, "Dataset not found"

        # Check order indices are sequential and start from 0
        indices = sorted([item['order_index'] for item in question_orders])
        expected = list(range(len(question_orders)))

        if indices != expected:
            return False, f"Order indices must be sequential starting from 0. Expected {expected}, got {indices}"

        # Check all question IDs exist and belong to dataset
        question_ids = [item['question_id'] for item in question_orders]
        count = db.execute(
            select(func.count())
            .where(DatasetQuestion.question_id.in_(question_ids))
            .where(DatasetQuestion.dataset_id == dataset_id)
        ).scalar() or 0

        if count != len(question_orders):
            return False, "Some questions not found or don't belong to this dataset"

        return True, None
