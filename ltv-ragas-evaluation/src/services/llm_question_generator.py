"""
LLM Question Generator Service

Generates questions and expected context from document content using LLMs.
"""

import json
import logging
import re
from typing import List, Dict, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

from src.config.settings import get_settings

logger = logging.getLogger(__name__)


class QuestionAnswer(BaseModel):
    """Schema for a single question-answer pair"""
    question: str = Field(description="A clear, specific question about the document content")
    expected_context: str = Field(
        description="The ground truth answer/context that directly answers the question"
    )
    confidence: float = Field(
        description="Confidence score between 0.0 and 1.0 for this Q&A pair",
        ge=0.0,
        le=1.0
    )


class QuestionSet(BaseModel):
    """Schema for a set of generated questions"""
    questions: List[QuestionAnswer] = Field(description="List of generated question-answer pairs")


class LLMQuestionGenerator:
    """Service for generating questions from document content using LLMs"""

    def __init__(self):
        """Initialize the LLM question generator with primary and fallback LLMs"""
        settings = get_settings()

        # Primary LLM: Google Gemini
        self.primary_llm = ChatGoogleGenerativeAI(
            model=settings.google_chat_model,
            temperature=0.3,
            max_output_tokens=4096,
            google_api_key=settings.google_api_key if settings.google_api_key else None,
        )

        # Fallback LLM: Ollama
        self.fallback_llm = ChatOllama(
            model=settings.ollama_chat_model,
            base_url=settings.ollama_base_url,
            temperature=0.3,
            num_predict=2000,
        )

        # Output parser
        self.parser = JsonOutputParser(pydantic_object=QuestionSet)

        # Create prompt template
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", self._get_system_prompt()),
            ("human", self._get_user_prompt()),
        ])

        logger.info("LLM Question Generator initialized with Gemini (primary) and Ollama (fallback)")

    def _get_system_prompt(self) -> str:
        """Get the system prompt for question generation"""
        return """You are an expert at creating high-quality question-answer pairs for Retrieval-Augmented Generation (RAG) evaluation.

Your task is to analyze the provided document content and generate diverse, meaningful questions along with their ground truth answers (expected context).

Guidelines:
1. **Question Quality:**
   - Generate questions that test different aspects: factual recall, conceptual understanding, relationships, and specific details
   - Questions should be clear, specific, and unambiguous
   - Avoid yes/no questions; prefer questions that require substantive answers
   - Include questions of varying complexity (simple facts to complex reasoning)

2. **Expected Context Quality:**
   - The expected context should be the precise passage from the document that answers the question
   - Keep expected context concise but complete (typically 1-3 sentences)
   - Expected context should directly address the question without extra information
   - Use exact phrases from the document when possible

3. **Diversity:**
   - Cover different sections/topics in the document
   - Mix different question types (what, how, why, when, where, which)
   - Test both explicit information and implicit knowledge

4. **Confidence Scoring:**
   - Assign higher confidence (0.8-1.0) to questions with clear, unambiguous answers
   - Assign medium confidence (0.6-0.8) to questions requiring some interpretation
   - Assign lower confidence (0.4-0.6) to questions where the answer is implicit or requires inference

5. **Number of Questions:**
   - Generate between 3-15 questions based on document length and content richness
   - For short documents (< 500 words): 3-5 questions
   - For medium documents (500-2000 words): 5-10 questions
   - For long documents (> 2000 words): 10-15 questions"""

    def _get_user_prompt(self) -> str:
        """Get the user prompt template"""
        return """Analyze the following document and generate high-quality question-answer pairs for RAG evaluation.

Document Content:
{content}

Document Statistics:
- Word count: {word_count}
- Character count: {char_count}

Generate {target_count} diverse, high-quality question-answer pairs from this document.

{format_instructions}

IMPORTANT: Return ONLY valid JSON matching the specified format. Do not include any markdown formatting, code blocks, or explanations."""

    def generate_questions(
        self,
        content: str,
        target_count: int,
        metadata: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Generate questions and expected context from document content.

        Args:
            content: Extracted text content from the document
            target_count: Target number of questions to generate
            metadata: Optional metadata about the document

        Returns:
            List of dicts with keys: question, expected_context, metadata

        Raises:
            Exception: If question generation fails with both primary and fallback LLMs
        """
        logger.info(f"Generating {target_count} questions from document ({len(content)} chars)")

        # Prepare input variables
        word_count = len(content.split())
        char_count = len(content)

        # Truncate content if too long (keep first + last portions)
        max_chars = 15000  # Reasonable limit for LLM context
        if char_count > max_chars:
            logger.warning(f"Content too long ({char_count} chars), truncating to {max_chars}")
            # Keep first 60% and last 40%
            split_point = int(max_chars * 0.6)
            remaining = max_chars - split_point
            content = content[:split_point] + "\n\n[... content truncated ...]\n\n" + content[-remaining:]
            char_count = len(content)

        try:
            # Try primary LLM (Gemini) first
            logger.info("Attempting question generation with Gemini")
            questions = self._generate_with_llm(
                self.primary_llm,
                content,
                target_count,
                word_count,
                char_count
            )
            logger.info(f"Successfully generated {len(questions)} questions with Gemini")

        except Exception as gemini_error:
            logger.warning(f"Gemini generation failed: {str(gemini_error)}, falling back to Ollama")

            try:
                # Fallback to Ollama
                logger.info("Attempting question generation with Ollama")
                questions = self._generate_with_llm(
                    self.fallback_llm,
                    content,
                    target_count,
                    word_count,
                    char_count
                )
                logger.info(f"Successfully generated {len(questions)} questions with Ollama")

            except Exception as ollama_error:
                logger.error(f"Both LLMs failed. Gemini: {gemini_error}, Ollama: {ollama_error}")
                raise Exception(
                    f"Failed to generate questions with both LLMs. "
                    f"Gemini error: {str(gemini_error)}, Ollama error: {str(ollama_error)}"
                )

        # Add metadata to each question
        if metadata:
            for q in questions:
                q["metadata"] = {
                    **q.get("metadata", {}),
                    "source_file": metadata.get("filename"),
                    "content_type": metadata.get("content_type"),
                    "word_count": word_count,
                }

        return questions

    def _generate_with_llm(
        self,
        llm: ChatGoogleGenerativeAI | ChatOllama,
        content: str,
        target_count: int,
        word_count: int,
        char_count: int
    ) -> List[Dict]:
        """
        Generate questions using a specific LLM.

        Args:
            llm: LLM instance to use
            content: Document content
            target_count: Target number of questions
            word_count: Word count of document
            char_count: Character count of document

        Returns:
            List of question dicts

        Raises:
            Exception: If generation or parsing fails
        """
        # Create chain
        chain = self.prompt | llm

        # Invoke chain
        response = chain.invoke({
            "content": content,
            "target_count": target_count,
            "word_count": word_count,
            "char_count": char_count,
            "format_instructions": self.parser.get_format_instructions(),
        })

        # Extract content
        response_text = response.content if hasattr(response, 'content') else str(response)

        # Clean markdown code blocks if present
        response_text = self._clean_markdown(response_text)

        # Parse JSON
        try:
            parsed_data = json.loads(response_text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {str(e)}")
            logger.debug(f"Response text: {response_text[:500]}")
            raise ValueError(f"LLM returned invalid JSON: {str(e)}")

        # Extract questions
        if "questions" not in parsed_data:
            raise ValueError("LLM response missing 'questions' field")

        questions = parsed_data["questions"]

        # Validate and format questions
        formatted_questions = []
        for q in questions:
            if not isinstance(q, dict):
                logger.warning(f"Skipping invalid question format: {q}")
                continue

            if "question" not in q or "expected_context" not in q:
                logger.warning(f"Skipping question missing required fields: {q}")
                continue

            formatted_questions.append({
                "question": q["question"].strip(),
                "expected_context": q["expected_context"].strip(),
                "metadata": {
                    "confidence": q.get("confidence", 0.8),
                    "generated_by": "llm",
                }
            })

        if not formatted_questions:
            raise ValueError("No valid questions generated by LLM")

        return formatted_questions

    def _clean_markdown(self, text: str) -> str:
        """
        Remove markdown code block formatting from JSON responses.

        Handles cases where LLM wraps JSON in ```json...``` or ```...```
        """
        if not text:
            return text

        # Remove markdown code blocks with optional language identifier
        cleaned = re.sub(r'^```(?:json)?\s*\n', '', text.strip())
        cleaned = re.sub(r'\n```\s*$', '', cleaned)

        return cleaned.strip()
