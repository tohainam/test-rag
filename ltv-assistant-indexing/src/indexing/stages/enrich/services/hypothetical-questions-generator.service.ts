/**
 * Hypothetical Questions Generator Service
 * Generates hypothetical questions for Multi-Vector Retrieval
 * Based on specs from docs/plans/enrich-stage.md - ĐC-4
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  EnrichedParentChunk,
  HypotheticalQuestionsResult,
} from '../types';
import { LLMProviderFactory, type LLMProvider } from './llm-provider.factory';

/**
 * Custom error for when LLM returns response but no valid questions after parsing
 */
class NoValidQuestionsError extends Error {
  constructor(chunkId: string, modelType: string) {
    super(
      `No valid questions generated for chunk ${chunkId} by ${modelType} model`,
    );
    this.name = 'NoValidQuestionsError';
  }
}

@Injectable()
export class HypotheticalQuestionsGeneratorService {
  private readonly logger = new Logger(
    HypotheticalQuestionsGeneratorService.name,
  );
  private model: BaseChatModel | null = null;
  private fallbackModel: BaseChatModel | null = null;
  private primaryModelName = '';
  private fallbackModelName = '';

  constructor(
    private readonly configService: ConfigService,
    private readonly llmProviderFactory: LLMProviderFactory,
  ) {
    this.initializeModel();
    this.initializeFallbackModel();
  }

  /**
   * Initialize LLM model if hypothetical questions generation is enabled
   */
  private initializeModel(): void {
    const enabled = this.configService.get<boolean>(
      'HYPOTHETICAL_QUESTIONS_ENABLED',
    );

    if (!enabled) {
      this.logger.log('Hypothetical questions generation is disabled');
      return;
    }

    try {
      // Priority: HYPOTHETICAL_QUESTIONS_PROVIDER → LLM_PROVIDER (global)
      const specificProvider = this.configService.get<LLMProvider>(
        'HYPOTHETICAL_QUESTIONS_PROVIDER',
      );
      const provider =
        specificProvider ||
        (this.configService.get<LLMProvider>('LLM_PROVIDER') as LLMProvider);

      // Priority: HYPOTHETICAL_QUESTIONS_MODEL → Provider's default model
      const specificModel = this.configService.get<string>(
        'HYPOTHETICAL_QUESTIONS_MODEL',
      );

      // Temperature higher (0.7) to generate diverse questions
      // Parse env vars to numbers (env vars are always strings)
      const temperature = parseFloat(
        this.configService.get<string>('HYPOTHETICAL_QUESTIONS_TEMPERATURE') ??
          '0.7',
      );
      const maxTokens = parseInt(
        this.configService.get<string>('HYPOTHETICAL_QUESTIONS_MAX_TOKENS') ??
          '150',
        10,
      );

      this.model = this.llmProviderFactory.createChatModel(provider, {
        model: specificModel, // Override model if set
        temperature,
        maxTokens,
      });

      // Store model name for logging
      this.primaryModelName = this.llmProviderFactory.getModelName(this.model);

      this.logger.log(
        `Hypothetical questions generation initialized: [${this.primaryModelName}]`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to initialize hypothetical questions generation model:',
        error,
      );
      this.model = null;
      this.primaryModelName = '';
    }
  }

  /**
   * Initialize fallback LLM model if enabled
   */
  private initializeFallbackModel(): void {
    const fallbackEnabled = this.configService.get<boolean>(
      'HYPOTHETICAL_QUESTIONS_FALLBACK_ENABLED',
    );

    if (!fallbackEnabled) {
      this.logger.log('Hypothetical questions fallback is disabled');
      return;
    }

    try {
      const fallbackProvider = this.configService.get<LLMProvider>(
        'HYPOTHETICAL_QUESTIONS_FALLBACK_PROVIDER',
      );
      const fallbackModelName = this.configService.get<string>(
        'HYPOTHETICAL_QUESTIONS_FALLBACK_MODEL',
      );

      if (!fallbackProvider) {
        this.logger.warn(
          'HYPOTHETICAL_QUESTIONS_FALLBACK_ENABLED=true but no HYPOTHETICAL_QUESTIONS_FALLBACK_PROVIDER set',
        );
        return;
      }

      this.fallbackModel = this.llmProviderFactory.createChatModel(
        fallbackProvider,
        {
          model: fallbackModelName,
          temperature: 0.7,
          maxTokens: 150,
        },
      );

      // Store fallback model name for logging
      this.fallbackModelName = this.llmProviderFactory.getModelName(
        this.fallbackModel,
      );

      this.logger.log(
        `Hypothetical questions fallback initialized: [${this.fallbackModelName}]`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to initialize fallback model for hypothetical questions:',
        error,
      );
      this.fallbackModel = null;
      this.fallbackModelName = '';
    }
  }

  /**
   * Generate hypothetical questions for a single parent chunk
   * @param chunk - Parent chunk to generate questions for
   * @returns Questions result or null if disabled/failed
   */
  async generateQuestions(
    chunk: EnrichedParentChunk,
  ): Promise<HypotheticalQuestionsResult | null> {
    if (!this.model) {
      return null; // Feature disabled
    }

    const maxRetries = parseInt(
      this.configService.get<string>('LLM_MAX_RETRIES') ?? '3',
      10,
    );
    const baseDelay = parseInt(
      this.configService.get<string>('LLM_RETRY_DELAY_MS') ?? '2000',
      10,
    );

    // Try primary model with retries (Option 4: Exponential Backoff)
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.generateQuestionsWithModel(
          chunk,
          this.model,
          'primary',
        );
      } catch {
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // 2s, 4s, 8s
          this.logger.warn(
            `Primary model failed for chunk ${chunk.id} (attempt ${attempt}/${maxRetries}), ` +
              `retrying in ${delay}ms...`,
          );
          await this.sleep(delay);
        } else {
          this.logger.warn(
            `Primary model failed for chunk ${chunk.id} after ${maxRetries} attempts. ` +
              'Trying fallback...',
          );
        }
      }
    }

    // Try fallback model if available (Option 5: Smart Fallback with Delay)
    if (this.fallbackModel) {
      const fallbackDelay = 1000; // 1s delay before fallback
      this.logger.log(
        `Waiting ${fallbackDelay}ms before fallback for chunk ${chunk.id}...`,
      );
      await this.sleep(fallbackDelay);

      try {
        return await this.generateQuestionsWithModel(
          chunk,
          this.fallbackModel,
          'fallback',
        );
      } catch (fallbackError) {
        this.logger.error(
          `Fallback model also failed for chunk ${chunk.id}: ${(fallbackError as Error).message}`,
        );
      }
    }

    // Both failed or no fallback → graceful degradation
    return null;
  }

  /**
   * Generate questions using a specific model
   */
  private async generateQuestionsWithModel(
    chunk: EnrichedParentChunk,
    model: BaseChatModel,
    modelType: 'primary' | 'fallback',
  ): Promise<HypotheticalQuestionsResult | null> {
    const startTime = Date.now();

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        'You are a question generation expert. Generate questions in a strict format.',
      ],
      [
        'user',
        `Generate 3-5 specific questions that this text chunk could answer.

Requirements:
- Short (< 20 words each)
- Specific to the content
- From different angles
- Must end with ?

Output Format (STRICT):
- Number each question: 1., 2., 3., etc.
- NO bold, NO italics, NO markdown
- NO explanations or notes in parentheses
- ONLY the question text
- One question per line

Example:
1. What is the main topic discussed?
2. How does this concept work?
3. What are the key benefits?

Text Chunk:
{content}

Questions:`,
      ],
    ]);

    const chain = prompt.pipe(model);

    // Pass timeout via RunnableConfig at invocation time (standard LangChain approach)
    const timeout = parseInt(
      this.configService.get<string>('HYPOTHETICAL_QUESTIONS_TIMEOUT') ?? '30',
      10,
    );
    const response = await chain.invoke(
      {
        content: chunk.content,
      },
      {
        timeout: timeout * 1000, // Convert seconds to milliseconds for invoke()
      },
    );

    let responseContent: string;
    if (typeof response.content === 'string') {
      responseContent = response.content;
    } else if (Array.isArray(response.content)) {
      responseContent = response.content
        .map((c: unknown) => (typeof c === 'string' ? c : JSON.stringify(c)))
        .join('');
    } else {
      responseContent = JSON.stringify(response.content);
    }
    const questions = this.parseQuestions(responseContent);
    const durationMs = Date.now() - startTime;

    // Estimate tokens (rough approximation)
    const tokensUsed = Math.ceil(
      (chunk.content.length + responseContent.length) / 4,
    );

    const modelInfo =
      modelType === 'primary' ? this.primaryModelName : this.fallbackModelName;

    if (questions.length === 0) {
      this.logger.log(
        `[${modelInfo}] No valid questions parsed for chunk ${chunk.id}, will retry`,
      );
      throw new NoValidQuestionsError(chunk.id, modelType);
    }

    this.logger.log(
      `[${modelInfo}] Generated ${questions.length} questions for chunk ${chunk.id} in ${durationMs}ms (${tokensUsed} tokens)`,
    );

    return {
      questions,
      tokensUsed,
      durationMs,
    };
  }

  /**
   * Generate hypothetical questions for multiple parent chunks in batches
   * @param chunks - Array of parent chunks
   * @returns Map of chunk ID to questions result
   */
  async batchGenerateQuestions(
    chunks: EnrichedParentChunk[],
  ): Promise<Map<string, HypotheticalQuestionsResult>> {
    if (!this.model) {
      return new Map(); // Feature disabled
    }

    const results = new Map<string, HypotheticalQuestionsResult>();
    const batchSize = parseInt(
      this.configService.get<string>('HYPOTHETICAL_QUESTIONS_BATCH_SIZE') ??
        '5',
      10,
    );

    let successCount = 0;
    let failedCount = 0;

    this.logger.log(
      `Generating hypothetical questions for ${chunks.length} chunks in batches of ${batchSize}`,
    );

    // Process in batches to optimize API calls
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      // Option 3: Rate Limiting - Add delay between batches (except first)
      if (i > 0) {
        const delay = 500; // 500ms delay between batches
        this.logger.log(
          `Rate limiting: waiting ${delay}ms before next batch...`,
        );
        await this.sleep(delay);
      }

      const batchResults = await Promise.all(
        batch.map(async (chunk) => {
          const result = await this.generateQuestions(chunk);
          return { chunkId: chunk.id, result };
        }),
      );

      // Add successful results to map and track stats
      batchResults.forEach(({ chunkId, result }) => {
        if (result && result.questions.length > 0) {
          results.set(chunkId, result);
          successCount++;
        } else {
          failedCount++;
        }
      });

      this.logger.log(
        `[${this.primaryModelName}] Batch ${Math.floor(i / batchSize) + 1}: Generated questions for ${batchResults.filter((r) => r.result).length}/${batch.length} chunks`,
      );
    }

    this.logger.log(
      `[${this.primaryModelName}] Hypothetical questions generation completed: ${successCount} succeeded, ${failedCount} failed (gracefully skipped)`,
    );

    return results;
  }

  /**
   * Parse questions from LLM response
   * Expected format: numbered list (1., 2., etc.)
   */
  private parseQuestions(response: string): string[] {
    const questions: string[] = [];

    // Parse numbered list format
    const lines = response.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) continue;

      // Match numbered questions: "1. Question?" or "1) Question?"
      // Only captures the question text after the number
      const match = /^\d+[.)]\s*(.+\?)$/.exec(trimmed);

      if (match) {
        const question = match[1].trim();

        // Validate question
        if (
          question.length > 10 && // Not too short
          question.length < 150 && // Not too long (< 20 words ~= 150 chars)
          this.countWords(question) <= 20 // Word limit
        ) {
          questions.push(question);
        } else {
          this.logger.log(
            `Question rejected: length=${question.length}, words=${this.countWords(question)}, text="${question}"`,
          );
        }
      }
    }

    // Limit to 5 questions max
    return questions.slice(0, 5);
  }

  /**
   * Count words in a string
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter((word) => word.length > 0).length;
  }

  /**
   * Sleep helper for rate limiting and retry delays
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if hypothetical questions generation is enabled
   */
  isEnabled(): boolean {
    return this.model !== null;
  }

  /**
   * Get total tokens used across all questions
   */
  getTotalTokensUsed(
    questionsMap: Map<string, HypotheticalQuestionsResult>,
  ): number {
    let total = 0;
    questionsMap.forEach((result) => {
      total += result.tokensUsed;
    });
    return total;
  }

  /**
   * Get average number of questions per chunk
   */
  getAverageQuestionsPerChunk(
    questionsMap: Map<string, HypotheticalQuestionsResult>,
  ): number {
    if (questionsMap.size === 0) {
      return 0;
    }

    let total = 0;
    questionsMap.forEach((result) => {
      total += result.questions.length;
    });

    return Math.round((total / questionsMap.size) * 10) / 10; // Round to 1 decimal
  }
}
