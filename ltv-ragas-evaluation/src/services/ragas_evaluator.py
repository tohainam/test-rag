"""
RAGAS Evaluator Service.
Provides integration with RAGAS metrics for evaluating retrieval quality.
"""

import os
import re
import gc
import numpy as np
from typing import Any, List, Optional
from pydantic import ConfigDict, Field
from ragas.metrics import ContextPrecision, ContextRecall, ContextRelevance
from ragas import evaluate
from ragas.llms import _LangchainLLMWrapper
from datasets import Dataset
from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage, AIMessage
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.outputs import ChatGeneration, ChatResult

from src.utils.logger import logger
from src.config.settings import get_settings


class CleanJSONGeminiChat(BaseChatModel):
    """
    Custom LangChain ChatModel wrapper for Google Gemini that cleans markdown code blocks.
    Fixes the issue where Gemini returns JSON wrapped in ```json...``` which RAGAS cannot parse.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    underlying_llm: Any = Field(description="The underlying ChatGoogleGenerativeAI instance")

    @property
    def _llm_type(self) -> str:
        """Return type of LLM."""
        return "clean_json_gemini"

    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        **kwargs: Any
    ) -> ChatResult:
        """Generate response and clean markdown code blocks."""
        # Call underlying Gemini LLM
        result = self.underlying_llm._generate(messages, stop=stop, **kwargs)

        # Clean markdown from all generations
        cleaned_generations = []
        for gen in result.generations:
            if isinstance(gen, ChatGeneration) and gen.message:
                cleaned_content = self._clean_markdown(gen.message.content)
                cleaned_message = AIMessage(content=cleaned_content)
                cleaned_gen = ChatGeneration(message=cleaned_message)
                cleaned_generations.append(cleaned_gen)
            else:
                cleaned_generations.append(gen)

        return ChatResult(generations=cleaned_generations, llm_output=result.llm_output)

    async def _agenerate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        **kwargs: Any
    ) -> ChatResult:
        """Async generate response and clean markdown code blocks."""
        # Call underlying Gemini LLM
        result = await self.underlying_llm._agenerate(messages, stop=stop, **kwargs)

        # Clean markdown from all generations
        cleaned_generations = []
        for gen in result.generations:
            if isinstance(gen, ChatGeneration) and gen.message:
                cleaned_content = self._clean_markdown(gen.message.content)
                cleaned_message = AIMessage(content=cleaned_content)
                cleaned_gen = ChatGeneration(message=cleaned_message)
                cleaned_generations.append(cleaned_gen)
            else:
                cleaned_generations.append(gen)

        return ChatResult(generations=cleaned_generations, llm_output=result.llm_output)

    def _clean_markdown(self, text: str) -> str:
        """
        Remove markdown code block formatting from JSON responses.
        Converts:
            ```json
            {"key": "value"}
            ```
        To:
            {"key": "value"}
        """
        if not text:
            return text

        # Remove markdown code blocks with optional language identifier
        cleaned = re.sub(r'^```(?:json)?\s*\n', '', text.strip())
        cleaned = re.sub(r'\n```\s*$', '', cleaned)

        # Also handle inline code blocks
        if cleaned.startswith('`') and cleaned.endswith('`'):
            cleaned = cleaned[1:-1]

        return cleaned.strip()


class RAGASEvaluator:
    """Service for computing RAGAS evaluation metrics."""

    def __init__(self) -> None:
        """Initialize RAGAS evaluator with metrics."""
        settings = get_settings()

        # Configure LLM for RAGAS - Google Gemini (primary) or Ollama (fallback)
        self.llm = self._get_llm()
        self.embeddings = self._get_embeddings()

        # Store whether we're using Gemini (for fallback logic)
        google_api_key = os.getenv('GOOGLE_API_KEY')
        self.using_gemini = bool(google_api_key)
        self.ollama_llm = None  # Lazy-initialized fallback

        # Initialize metrics with LLM only
        # RAGAS 0.3.9 API: All metrics only take llm parameter
        self.metrics = [
            ContextPrecision(llm=self.llm),
            ContextRecall(llm=self.llm),
            ContextRelevance(llm=self.llm)
        ]

        logger.info(f"Initialized RAGAS evaluator with {len(self.metrics)} metrics")

    def _get_llm(self):
        """
        Get LLM instance for RAGAS evaluation.
        Primary: Google Gemini (better JSON generation and reliability)
        Fallback: Ollama with native ChatOllama (NOT ChatOpenAI adapter)
        """
        # Primary: Try Google Gemini first
        google_api_key = os.getenv('GOOGLE_API_KEY')
        google_chat_model = os.getenv('GOOGLE_CHAT_MODEL', 'gemini-2.5-flash-lite')

        if google_api_key:
            try:
                # Create underlying Gemini LLM
                gemini_llm = ChatGoogleGenerativeAI(
                    model=google_chat_model,
                    temperature=0.3,
                    max_output_tokens=2048,  # Increased for Vietnamese text + verbose JSON
                    api_key=google_api_key
                )
                # Wrap with custom CleanJSONGeminiChat that strips markdown code blocks
                # This fixes the issue where Gemini returns ```json\n{...}\n``` instead of raw JSON
                clean_llm = CleanJSONGeminiChat(underlying_llm=gemini_llm)
                # Wrap with RAGAS LangchainLLMWrapper for proper compatibility
                wrapped_llm = _LangchainLLMWrapper(clean_llm)
                logger.info(f"Successfully initialized Google Gemini LLM with model {google_chat_model} (with JSON cleaning)")
                return wrapped_llm
            except Exception as e:
                logger.warning(f"Failed to initialize Google Gemini LLM: {e}, falling back to Ollama")
        else:
            logger.info("GOOGLE_API_KEY not found, using Ollama as primary LLM")

        # Fallback: Use native ChatOllama (NOT ChatOpenAI adapter)
        ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://ollama:11434')
        ollama_chat_model = os.getenv('OLLAMA_CHAT_MODEL', 'gemma3:4b')

        try:
            # Use native ChatOllama from langchain_ollama package
            # This has proper RAGAS compatibility unlike the ChatOpenAI adapter
            llm = ChatOllama(
                model=ollama_chat_model,
                base_url=ollama_base_url,
                temperature=0.3,
                num_predict=2048,  # Increased from 500 for complex Vietnamese text and JSON generation
                timeout=300  # 5 minutes timeout for complex evaluations
            )
            # Wrap with RAGAS LangchainLLMWrapper for proper compatibility
            wrapped_llm = _LangchainLLMWrapper(llm)
            logger.info(f"Successfully initialized Ollama LLM at {ollama_base_url} with model {ollama_chat_model} (3.3GB - optimized for concurrent RAGAS metrics)")
            return wrapped_llm
        except Exception as e:
            logger.error(f"Failed to initialize Ollama LLM: {e}", exc_info=True)
            raise Exception(
                f"Failed to initialize LLM. Tried Google Gemini and Ollama. "
                f"Ensure GOOGLE_API_KEY is set or Ollama is running at {ollama_base_url}. "
                f"Error: {str(e)}"
            ) from e

    def _get_ollama_fallback(self):
        """
        Get Ollama LLM as fallback when Gemini fails.
        Lazy initialization - only created when needed.
        """
        if self.ollama_llm is not None:
            return self.ollama_llm

        ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://ollama:11434')
        ollama_chat_model = os.getenv('OLLAMA_CHAT_MODEL', 'gemma3:4b')

        try:
            llm = ChatOllama(
                model=ollama_chat_model,
                base_url=ollama_base_url,
                temperature=0.3,
                num_predict=2048,  # Increased for complex evaluations
                timeout=300  # 5 minutes timeout
            )
            self.ollama_llm = _LangchainLLMWrapper(llm)
            logger.info(f"Initialized Ollama fallback LLM with model {ollama_chat_model}")
            return self.ollama_llm
        except Exception as e:
            logger.error(f"Failed to initialize Ollama fallback: {e}", exc_info=True)
            return None

    def _get_embeddings(self):
        """Get embeddings instance for RAGAS evaluation using Ollama."""
        ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://ollama:11434')
        ollama_embedding_model = os.getenv('OLLAMA_EMBEDDING_MODEL', 'bge-m3:567m')

        try:
            embeddings = OllamaEmbeddings(
                model=ollama_embedding_model,
                base_url=ollama_base_url
            )
            logger.info(f"Successfully initialized Ollama Embeddings at {ollama_base_url} with model {ollama_embedding_model}")
            return embeddings
        except Exception as e:
            logger.error(f"Failed to initialize Ollama Embeddings: {e}", exc_info=True)
            raise Exception(
                f"Failed to initialize Ollama Embeddings at {ollama_base_url} with model {ollama_embedding_model}. "
                f"Ensure Ollama is running and the model is available. "
                f"Error: {str(e)}"
            ) from e

    def evaluate_single(
        self,
        question: str,
        contexts: list[str],
        expected_context: str
    ) -> dict[str, float]:
        """
        Evaluate a single question using RAGAS metrics.

        Args:
            question: The question being evaluated
            contexts: Retrieved contexts from retrieval service
            expected_context: Expected/ground truth context

        Returns:
            Dict with scores for each metric:
            {
                'context_precision': 0.0-1.0,
                'context_recall': 0.0-1.0,
                'context_relevancy': 0.0-1.0
            }

        Raises:
            Exception: If RAGAS evaluation fails
        """
        # Prepare dataset in RAGAS format
        data = {
            'question': [question],
            'contexts': [contexts],
            'ground_truth': [expected_context]
        }

        dataset = Dataset.from_dict(data)

        # Run metrics SEQUENTIALLY (one at a time) to avoid OOM issues
        # Instead of passing all 3 metrics to evaluate(), run each metric separately
        try:
            logger.info(f"Evaluating question with RAGAS (sequential mode): {question[:100]}...")

            # Initialize all scores to None first
            scores = {
                'context_precision': None,
                'context_recall': None,
                'context_relevancy': None
            }

            # Run each metric one at a time to prevent concurrent model loading
            for idx, metric in enumerate(self.metrics):
                metric_name = metric.__class__.__name__
                logger.info(f"Running metric {idx+1}/3: {metric_name}")

                try:
                    # CRITICAL: Cleanup old LLM instances BEFORE reinitializing to prevent memory stacking
                    # After 2+ sequential evaluations, the async event loop can close
                    if idx > 0:
                        logger.info(f"Cleaning up old LLM instances before reinitializing for {metric_name}")

                        # Explicitly delete the PREVIOUS metric (idx-1) and its LLM
                        # This is critical: we need to delete the metric we just finished, not the current one
                        prev_metric = self.metrics[idx - 1]
                        if hasattr(prev_metric, 'llm'):
                            prev_llm = prev_metric.llm
                            del prev_metric.llm
                            del prev_llm
                        del prev_metric

                        # Also delete the main LLM reference from the class
                        if hasattr(self, 'llm'):
                            del self.llm

                        # Force garbage collection to free up 4.7GB BEFORE loading new instance
                        gc.collect()
                        logger.info("Garbage collection completed, memory freed")

                        logger.info(f"Reinitializing LLM for {metric_name} to prevent event loop closure")
                        fresh_llm = self._get_llm()  # Get fresh LLM with new event loop

                        # Store new LLM in class instance for next cleanup
                        self.llm = fresh_llm

                        # Recreate the specific metric with fresh LLM
                        if 'Precision' in metric_name:
                            metric = ContextPrecision(llm=fresh_llm)
                        elif 'Recall' in metric_name:
                            metric = ContextRecall(llm=fresh_llm)
                        elif 'Relevance' in metric_name:
                            metric = ContextRelevance(llm=fresh_llm)

                    # Run single metric evaluation
                    result = evaluate(dataset, metrics=[metric])

                    # Extract score for this metric ONLY (don't overwrite others)
                    partial_scores = self._extract_scores(result)

                    # Only update the score that was actually computed
                    for key, value in partial_scores.items():
                        if value is not None and not (isinstance(value, float) and np.isnan(value)):
                            # Only update if we got a real value (not None, not NaN, not 0.0 placeholder)
                            if value != 0.0 or scores[key] is None:
                                scores[key] = value

                    logger.info(f"Completed {metric_name}: {partial_scores}")

                except Exception as metric_error:
                    logger.error(f"Metric {metric_name} failed: {metric_error}", exc_info=True)
                    # Assign NaN for failed metric but continue with others
                    if 'context_precision' not in scores and 'Precision' in metric_name:
                        scores['context_precision'] = np.nan
                    elif 'context_recall' not in scores and 'Recall' in metric_name:
                        scores['context_recall'] = np.nan
                    elif 'context_relevancy' not in scores and 'Relevance' in metric_name:
                        scores['context_relevancy'] = np.nan

            # Check for NaN values
            if any(np.isnan(score) for score in scores.values()):
                logger.warning(f"RAGAS returned NaN scores with primary LLM. Scores: {scores}")

                # If using Gemini and got NaN, try fallback to Ollama
                if self.using_gemini:
                    raise Exception("NaN scores with Gemini, attempting Ollama fallback")
                else:
                    # Already using Ollama, no fallback available
                    raise Exception("RAGAS evaluation returned NaN scores. Check LLM connectivity and model compatibility.")

            logger.info(f"RAGAS scores (sequential): precision={scores['context_precision']:.3f}, "
                        f"recall={scores['context_recall']:.3f}, "
                        f"relevancy={scores['context_relevancy']:.3f}")

            return scores

        except Exception as primary_error:
            # If using Gemini and it failed, try fallback to Ollama
            if self.using_gemini and "NaN scores" in str(primary_error):
                logger.warning(f"Primary LLM (Gemini) failed, attempting Ollama fallback: {primary_error}")

                fallback_llm = self._get_ollama_fallback()
                if fallback_llm is None:
                    logger.error("Ollama fallback not available")
                    raise Exception(f"RAGAS evaluation failed with Gemini and Ollama fallback unavailable: {str(primary_error)}") from primary_error

                try:
                    # Recreate metrics with Ollama LLM
                    fallback_metrics = [
                        ContextPrecision(llm=fallback_llm),
                        ContextRecall(llm=fallback_llm),
                        ContextRelevance(llm=fallback_llm)
                    ]

                    logger.info("Retrying evaluation with Ollama fallback (sequential mode)...")
                    scores = {}

                    # Run each metric sequentially with fallback LLM
                    for metric in fallback_metrics:
                        metric_name = metric.__class__.__name__
                        logger.info(f"Running fallback metric: {metric_name}")

                        try:
                            result = evaluate(dataset, metrics=[metric])
                            partial_scores = self._extract_scores(result)
                            scores.update(partial_scores)
                            logger.info(f"Fallback {metric_name} completed: {partial_scores}")
                        except Exception as metric_error:
                            logger.error(f"Fallback metric {metric_name} failed: {metric_error}", exc_info=True)
                            # Assign NaN for failed metric
                            if 'context_precision' not in scores and 'Precision' in metric_name:
                                scores['context_precision'] = np.nan
                            elif 'context_recall' not in scores and 'Recall' in metric_name:
                                scores['context_recall'] = np.nan
                            elif 'context_relevancy' not in scores and 'Relevance' in metric_name:
                                scores['context_relevancy'] = np.nan

                    # Check for NaN again
                    if any(np.isnan(score) for score in scores.values()):
                        logger.error(f"Ollama fallback also returned NaN scores. Scores: {scores}")
                        raise Exception("RAGAS evaluation returned NaN scores even with Ollama fallback.")

                    logger.info(f"Ollama fallback succeeded! RAGAS scores: precision={scores['context_precision']:.3f}, "
                                f"recall={scores['context_recall']:.3f}, "
                                f"relevancy={scores['context_relevancy']:.3f}")

                    return scores

                except Exception as fallback_error:
                    logger.error(f"Ollama fallback also failed: {fallback_error}", exc_info=True)
                    raise Exception(f"RAGAS evaluation failed with both Gemini and Ollama: {str(fallback_error)}") from fallback_error
            else:
                # Not using Gemini or different error
                logger.error(f"RAGAS evaluation failed: {primary_error}", exc_info=True)
                raise Exception(f"RAGAS evaluation failed: {str(primary_error)}") from primary_error

    def _extract_scores(self, result) -> dict[str, float]:
        """
        Extract scores from RAGAS evaluation result.
        RAGAS 0.3.9 returns results as a pandas DataFrame.

        Args:
            result: RAGAS evaluation result

        Returns:
            Dict with context_precision, context_recall, context_relevancy scores
        """
        try:
            # Convert result to pandas DataFrame
            df = result.to_pandas()
            logger.debug(f"RAGAS result DataFrame columns: {list(df.columns)}")
            logger.debug(f"RAGAS result DataFrame shape: {df.shape}")

            if len(df) == 0:
                raise Exception("RAGAS returned empty result DataFrame")

            # Extract scores from the first (and only) row
            # Column names may vary: context_precision, context_recall, nv_context_relevance
            scores = {}

            # Map column names to our standard keys
            column_mapping = {
                'context_precision': 'context_precision',
                'context_recall': 'context_recall',
                'nv_context_relevance': 'context_relevancy',
                'context_relevancy': 'context_relevancy',
                'context_relevance': 'context_relevancy'
            }

            for col in df.columns:
                for ragas_col, standard_key in column_mapping.items():
                    if ragas_col.lower() in col.lower():
                        value = df[col].iloc[0]
                        scores[standard_key] = float(value) if not np.isnan(value) else np.nan
                        break

            # Ensure all required scores are present
            required_keys = ['context_precision', 'context_recall', 'context_relevancy']
            for key in required_keys:
                if key not in scores:
                    logger.warning(f"Score '{key}' not found in RAGAS result. Available columns: {list(df.columns)}")
                    scores[key] = 0.0

            logger.info(f"Extracted scores: {scores}")
            return scores

        except Exception as e:
            logger.error(f"Failed to extract scores from RAGAS result: {e}", exc_info=True)
            # Return zeros as fallback to prevent crashes, but log the issue
            return {
                'context_precision': 0.0,
                'context_recall': 0.0,
                'context_relevancy': 0.0
            }


# Singleton instance
_ragas_evaluator: RAGASEvaluator | None = None


def get_ragas_evaluator() -> RAGASEvaluator:
    """
    Get or create singleton RAGAS evaluator instance.

    Returns:
        RAGASEvaluator instance
    """
    global _ragas_evaluator
    if _ragas_evaluator is None:
        _ragas_evaluator = RAGASEvaluator()
    return _ragas_evaluator
