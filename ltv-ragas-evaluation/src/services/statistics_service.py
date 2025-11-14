"""
Statistics Service.
Calculates aggregate statistics for evaluation results.
"""

from statistics import mean, median, stdev
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models.result import EvaluationResult
from src.utils.logger import logger


class StatisticsService:
    """Service for calculating evaluation statistics."""

    @staticmethod
    def calculate_run_statistics(
        db: Session,
        run_id: str
    ) -> dict[str, dict[str, float]]:
        """
        Calculate aggregate statistics for all results in a run.

        Args:
            db: Database session
            run_id: Evaluation run ID

        Returns:
            Dict with statistics for each metric:
            {
                'context_precision': {'mean': 0.85, 'median': 0.87, 'std_dev': 0.12, 'min': 0.45, 'max': 1.0},
                'context_recall': {...},
                'context_relevancy': {...}
            }
        """
        # Get all results for this run with scores (filter by having at least one score)
        results = db.execute(
            select(EvaluationResult)
            .where(EvaluationResult.run_id == run_id)
            .where(
                (EvaluationResult.context_precision.isnot(None)) |
                (EvaluationResult.context_recall.isnot(None)) |
                (EvaluationResult.context_relevancy.isnot(None))
            )
        ).scalars().all()

        if not results:
            logger.warning(f"No completed results found for run {run_id}")
            return {
                'context_precision': {},
                'context_recall': {},
                'context_relevancy': {}
            }

        # Extract scores
        precision_scores = [r.context_precision for r in results if r.context_precision is not None]
        recall_scores = [r.context_recall for r in results if r.context_recall is not None]
        relevancy_scores = [r.context_relevancy for r in results if r.context_relevancy is not None]

        # Calculate statistics for each metric
        statistics = {
            'context_precision': StatisticsService._calculate_metric_stats(precision_scores),
            'context_recall': StatisticsService._calculate_metric_stats(recall_scores),
            'context_relevancy': StatisticsService._calculate_metric_stats(relevancy_scores)
        }

        logger.info(f"Calculated statistics for run {run_id}: {len(results)} results")
        return statistics

    @staticmethod
    def _calculate_metric_stats(scores: list[float]) -> dict[str, float]:
        """
        Calculate statistics for a single metric.

        Args:
            scores: List of scores for a metric

        Returns:
            Dict with mean, median, std_dev, min, max
        """
        if not scores:
            return {}

        if len(scores) == 1:
            return {
                'mean': scores[0],
                'median': scores[0],
                'std_dev': 0.0,
                'min': scores[0],
                'max': scores[0],
                'count': 1
            }

        return {
            'mean': mean(scores),
            'median': median(scores),
            'std_dev': stdev(scores) if len(scores) > 1 else 0.0,
            'min': min(scores),
            'max': max(scores),
            'count': len(scores)
        }

    @staticmethod
    def calculate_average_scores(
        db: Session,
        run_id: str
    ) -> dict[str, float]:
        """
        Calculate average scores for each metric.

        Args:
            db: Database session
            run_id: Evaluation run ID

        Returns:
            Dict with average scores:
            {
                'context_precision': 0.85,
                'context_recall': 0.78,
                'context_relevancy': 0.92
            }
        """
        # Get all results with scores (filter by having at least one score)
        results = db.execute(
            select(EvaluationResult)
            .where(EvaluationResult.run_id == run_id)
            .where(
                (EvaluationResult.context_precision.isnot(None)) |
                (EvaluationResult.context_recall.isnot(None)) |
                (EvaluationResult.context_relevancy.isnot(None))
            )
        ).scalars().all()

        if not results:
            return {
                'context_precision': 0.0,
                'context_recall': 0.0,
                'context_relevancy': 0.0
            }

        # Extract and average scores
        precision_scores = [r.context_precision for r in results if r.context_precision is not None]
        recall_scores = [r.context_recall for r in results if r.context_recall is not None]
        relevancy_scores = [r.context_relevancy for r in results if r.context_relevancy is not None]

        return {
            'context_precision': mean(precision_scores) if precision_scores else 0.0,
            'context_recall': mean(recall_scores) if recall_scores else 0.0,
            'context_relevancy': mean(relevancy_scores) if relevancy_scores else 0.0
        }
