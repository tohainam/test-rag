"""
Dataset service layer for business logic.
Handles dataset CRUD operations and related logic.
"""

import uuid
from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session
from redis import Redis
from rq import Queue
from typing import Optional

from src.models.dataset import EvaluationDataset
from src.models.question import DatasetQuestion
from src.models.dataset_file import DatasetFile
from src.models.run import EvaluationRun
from src.models.result import EvaluationResult
from src.models.generation_job import QuestionGenerationJob, GenerationStatus
from src.utils.logger import logger
from src.config.settings import get_settings


class DatasetService:
    """Service for dataset management operations."""

    @staticmethod
    def create_dataset(
        db: Session,
        name: str,
        source: str,
        created_by_user_id: int,
        description: str | None = None,
        file_ids: list[str] | None = None
    ) -> EvaluationDataset:
        """
        Create a new dataset.

        Args:
            db: Database session
            name: Dataset name
            source: Dataset source ('manual' or 'llm_generated')
            created_by_user_id: User ID creating the dataset
            description: Optional description
            file_ids: Optional list of file IDs to link

        Returns:
            Created dataset
        """
        # Create dataset
        dataset = EvaluationDataset(
            name=name,
            description=description,
            source=source,
            total_questions=0,
            created_by_user_id=created_by_user_id
        )

        db.add(dataset)
        db.flush()  # Get dataset_id

        # Link files if provided
        if file_ids:
            for file_id in file_ids:
                link = DatasetFile(
                    dataset_id=dataset.dataset_id,
                    file_id=file_id
                )
                db.add(link)

        db.commit()
        db.refresh(dataset)

        logger.info(f"Created dataset: {dataset.dataset_id}")
        return dataset

    @staticmethod
    def update_dataset(
        db: Session,
        dataset_id: str,
        name: str | None = None,
        description: str | None = None
    ) -> EvaluationDataset | None:
        """
        Update a dataset.

        Args:
            db: Database session
            dataset_id: Dataset ID
            name: Optional new name
            description: Optional new description

        Returns:
            Updated dataset or None if not found
        """
        dataset = db.execute(
            select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id)
        ).scalar_one_or_none()

        if not dataset:
            return None

        # Update fields
        if name is not None:
            dataset.name = name
        if description is not None:
            dataset.description = description

        db.commit()
        db.refresh(dataset)

        logger.info(f"Updated dataset: {dataset_id}")
        return dataset

    @staticmethod
    def delete_dataset(db: Session, dataset_id: str) -> dict | None:
        """
        Delete a dataset and all related data (cascade).

        Args:
            db: Database session
            dataset_id: Dataset ID

        Returns:
            Dict with deleted counts or None if dataset not found
        """
        # Check if dataset exists
        dataset = db.execute(
            select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id)
        ).scalar_one_or_none()

        if not dataset:
            return None

        # Count items to be deleted
        questions_count = db.execute(
            select(func.count()).where(DatasetQuestion.dataset_id == dataset_id)
        ).scalar() or 0

        files_count = db.execute(
            select(func.count()).where(DatasetFile.dataset_id == dataset_id)
        ).scalar() or 0

        runs_count = db.execute(
            select(func.count()).where(EvaluationRun.dataset_id == dataset_id)
        ).scalar() or 0

        # Delete in order (cascade will handle some, but explicit is safer)
        # 1. Delete evaluation results (via runs cascade)
        run_ids = db.execute(
            select(EvaluationRun.run_id).where(EvaluationRun.dataset_id == dataset_id)
        ).scalars().all()

        for run_id in run_ids:
            db.execute(
                delete(EvaluationResult).where(EvaluationResult.run_id == run_id)
            )

        # 2. Delete evaluation runs
        db.execute(
            delete(EvaluationRun).where(EvaluationRun.dataset_id == dataset_id)
        )

        # 3. Delete questions
        db.execute(
            delete(DatasetQuestion).where(DatasetQuestion.dataset_id == dataset_id)
        )

        # 4. Delete file links
        db.execute(
            delete(DatasetFile).where(DatasetFile.dataset_id == dataset_id)
        )

        # 5. Delete dataset
        db.delete(dataset)

        db.commit()

        logger.info(f"Deleted dataset: {dataset_id}")

        return {
            'dataset': 1,
            'questions': questions_count,
            'file_links': files_count,
            'runs': runs_count
        }

    @staticmethod
    def get_dataset_with_details(db: Session, dataset_id: str) -> dict | None:
        """
        Get dataset with all questions and linked files.

        Args:
            db: Database session
            dataset_id: Dataset ID

        Returns:
            Dict with dataset, questions, and files or None if not found
        """
        # Get dataset
        dataset = db.execute(
            select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id)
        ).scalar_one_or_none()

        if not dataset:
            return None

        # Get questions (ordered by order_index)
        questions = db.execute(
            select(DatasetQuestion)
            .where(DatasetQuestion.dataset_id == dataset_id)
            .order_by(DatasetQuestion.order_index)
        ).scalars().all()

        # Get linked files
        from src.models.file import EvaluationFile
        files = db.execute(
            select(EvaluationFile)
            .join(DatasetFile, DatasetFile.file_id == EvaluationFile.file_id)
            .where(DatasetFile.dataset_id == dataset_id)
        ).scalars().all()

        return {
            'dataset': dataset,
            'questions': questions,
            'files': files
        }

    @staticmethod
    def add_files_to_dataset(
        db: Session,
        dataset_id: str,
        file_ids: list[str]
    ) -> EvaluationDataset | None:
        """
        Add files to a dataset.

        Args:
            db: Database session
            dataset_id: Dataset ID
            file_ids: List of file IDs to add

        Returns:
            Updated dataset or None if not found
        """
        # Check if dataset exists
        dataset = db.execute(
            select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id)
        ).scalar_one_or_none()

        if not dataset:
            return None

        # Get existing file links
        existing_file_ids = {
            link.file_id
            for link in db.execute(
                select(DatasetFile).where(DatasetFile.dataset_id == dataset_id)
            ).scalars().all()
        }

        # Add new file links
        for file_id in file_ids:
            if file_id not in existing_file_ids:
                link = DatasetFile(
                    dataset_id=dataset_id,
                    file_id=file_id
                )
                db.add(link)

        db.commit()
        db.refresh(dataset)

        logger.info(f"Added {len(file_ids)} files to dataset: {dataset_id}")
        return dataset

    @staticmethod
    def remove_file_from_dataset(
        db: Session,
        dataset_id: str,
        file_id: str
    ) -> bool:
        """
        Remove a file from a dataset.

        Args:
            db: Database session
            dataset_id: Dataset ID
            file_id: File ID to remove

        Returns:
            True if removed, False if not found
        """
        # Check if dataset exists
        dataset = db.execute(
            select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id)
        ).scalar_one_or_none()

        if not dataset:
            return False

        # Delete file link
        result = db.execute(
            delete(DatasetFile).where(
                DatasetFile.dataset_id == dataset_id,
                DatasetFile.file_id == file_id
            )
        )

        db.commit()

        removed = result.rowcount > 0
        if removed:
            logger.info(f"Removed file {file_id} from dataset: {dataset_id}")

        return removed

    @staticmethod
    def trigger_question_generation(
        db: Session,
        dataset_id: str,
        file_ids: Optional[list[str]] = None,
        config: Optional[dict] = None
    ) -> tuple[str, int]:
        """
        Trigger question generation for a dataset.

        Args:
            db: Database session
            dataset_id: Dataset ID
            file_ids: Optional list of specific file IDs to process
            config: Optional generation configuration

        Returns:
            Tuple of (job_id, total_files)

        Raises:
            ValueError: If dataset not found or has no files
        """
        settings = get_settings()

        # Validate dataset exists
        dataset = db.execute(
            select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id)
        ).scalar_one_or_none()

        if not dataset:
            raise ValueError(f"Dataset not found: {dataset_id}")

        # Count files to process
        if file_ids:
            total_files = len(file_ids)
        else:
            total_files = db.execute(
                select(func.count(DatasetFile.file_id))
                .where(DatasetFile.dataset_id == dataset_id)
            ).scalar()

        if total_files == 0:
            raise ValueError("No files to process")

        # Create generation job
        job_id = str(uuid.uuid4())
        generation_job = QuestionGenerationJob(
            job_id=job_id,
            dataset_id=dataset_id,
            status=GenerationStatus.pending,
            total_files=total_files,
            config=config,
        )
        db.add(generation_job)
        db.commit()

        # Enqueue worker task
        try:
            from src.workers.question_generation_worker import run_question_generation
            redis_conn = Redis.from_url(settings.redis_url)
            queue = Queue('ragas-queue', connection=redis_conn)
            queue.enqueue(
                run_question_generation,
                job_id,  # First positional argument
                dataset_id,  # Second positional argument
                file_ids,  # Third positional argument
                job_timeout='1h',  # Timeout as keyword argument
            )
            logger.info(
                f"Enqueued question generation job {job_id} for dataset {dataset_id} "
                f"with {total_files} files"
            )
        except Exception as e:
            logger.error(f"Failed to enqueue generation job: {str(e)}")
            # Mark job as failed
            generation_job.status = GenerationStatus.failed
            generation_job.error_messages = [f"Failed to enqueue job: {str(e)}"]
            db.commit()
            raise

        return job_id, total_files
