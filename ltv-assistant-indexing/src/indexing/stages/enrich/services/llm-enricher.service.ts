/**
 * LLM Enricher Service
 * Generates summaries using LLM with multi-provider support
 * Based on specs from docs/plans/enrich-stage.md - ĐC-6
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { EnrichedParentChunk, SummaryResult } from '../types';
import { LLMProviderFactory, type LLMProvider } from './llm-provider.factory';

@Injectable()
export class LlmEnricherService {
  private readonly logger = new Logger(LlmEnricherService.name);
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
   * Initialize LLM model if summary generation is enabled
   */
  private initializeModel(): void {
    const enabled = this.configService.get<boolean>(
      'SUMMARY_GENERATION_ENABLED',
    );

    if (!enabled) {
      this.logger.log('Summary generation is disabled');
      return;
    }

    try {
      // Priority: SUMMARY_GENERATION_PROVIDER → LLM_PROVIDER (global)
      const specificProvider = this.configService.get<LLMProvider>(
        'SUMMARY_GENERATION_PROVIDER',
      );
      const provider =
        specificProvider ||
        (this.configService.get<LLMProvider>('LLM_PROVIDER') as LLMProvider);

      // Priority: SUMMARY_GENERATION_MODEL → Provider's default model
      const specificModel = this.configService.get<string>(
        'SUMMARY_GENERATION_MODEL',
      );

      // Parse env vars to numbers (env vars are always strings)
      const temperature = parseFloat(
        this.configService.get<string>('SUMMARY_TEMPERATURE') ?? '0.3',
      );
      const maxTokens = parseInt(
        this.configService.get<string>('SUMMARY_MAX_TOKENS') ?? '100',
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
        `Summary generation initialized: [${this.primaryModelName}]`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to initialize summary generation model:',
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
      'SUMMARY_FALLBACK_ENABLED',
    );

    if (!fallbackEnabled) {
      this.logger.log('Summary fallback is disabled');
      return;
    }

    try {
      const fallbackProvider = this.configService.get<LLMProvider>(
        'SUMMARY_FALLBACK_PROVIDER',
      );
      const fallbackModelName = this.configService.get<string>(
        'SUMMARY_FALLBACK_MODEL',
      );

      if (!fallbackProvider) {
        this.logger.warn(
          'SUMMARY_FALLBACK_ENABLED=true but no SUMMARY_FALLBACK_PROVIDER set',
        );
        return;
      }

      this.fallbackModel = this.llmProviderFactory.createChatModel(
        fallbackProvider,
        {
          model: fallbackModelName,
          temperature: 0.3,
          maxTokens: 100,
        },
      );

      // Store fallback model name for logging
      this.fallbackModelName = this.llmProviderFactory.getModelName(
        this.fallbackModel,
      );

      this.logger.log(
        `Summary fallback initialized: [${this.fallbackModelName}]`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize fallback model:', error);
      this.fallbackModel = null;
      this.fallbackModelName = '';
    }
  }

  /**
   * Generate summary for a single parent chunk
   * @param chunk - Parent chunk to summarize
   * @returns Summary result or null if disabled/failed
   */
  async generateSummary(
    chunk: EnrichedParentChunk,
  ): Promise<SummaryResult | null> {
    if (!this.model) {
      return null; // LLM enrichment disabled
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
        return await this.generateSummaryWithModel(
          chunk,
          this.model,
          'primary',
        );
      } catch {
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // 2s, 4s, 8s
          this.logger.warn(
            `[${this.primaryModelName}] Failed for chunk ${chunk.id} (attempt ${attempt}/${maxRetries}), ` +
              `retrying in ${delay}ms...`,
          );
          await this.sleep(delay);
        } else {
          this.logger.warn(
            `[${this.primaryModelName}] Failed for chunk ${chunk.id} after ${maxRetries} attempts. ` +
              'Trying fallback...',
          );
        }
      }
    }

    // Try fallback model if available (Option 5: Smart Fallback with Delay)
    if (this.fallbackModel) {
      const fallbackDelay = 1000; // 1s delay before fallback
      this.logger.log(
        `Waiting ${fallbackDelay}ms before fallback (${this.primaryModelName} → ${this.fallbackModelName}) for chunk ${chunk.id}...`,
      );
      await this.sleep(fallbackDelay);

      try {
        return await this.generateSummaryWithModel(
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
   * Generate summary using a specific model
   */
  private async generateSummaryWithModel(
    chunk: EnrichedParentChunk,
    model: BaseChatModel,
    modelType: 'primary' | 'fallback',
  ): Promise<SummaryResult> {
    const startTime = Date.now();

    const prompt = `Summarize the following text in 2-3 sentences, focusing on the main idea:

${chunk.content}

Summary:`;

    // Pass timeout via RunnableConfig at invocation time (standard LangChain approach)
    const timeout = parseInt(
      this.configService.get<string>('SUMMARY_TIMEOUT') ?? '30',
      10,
    );
    const response = await model.invoke(prompt, {
      timeout: timeout * 1000, // Convert seconds to milliseconds for invoke()
    });
    let summary: string;
    if (typeof response.content === 'string') {
      summary = response.content.trim();
    } else if (Array.isArray(response.content)) {
      summary = response.content
        .map((c: unknown) => (typeof c === 'string' ? c : JSON.stringify(c)))
        .join('')
        .trim();
    } else {
      summary = JSON.stringify(response.content).trim();
    }

    const durationMs = Date.now() - startTime;

    // Estimate tokens (rough approximation: 4 chars per token)
    const tokensUsed = Math.ceil((prompt.length + summary.length) / 4);

    const modelInfo =
      modelType === 'primary' ? this.primaryModelName : this.fallbackModelName;
    this.logger.log(
      `[${modelInfo}] Generated summary for chunk ${chunk.id} in ${durationMs}ms (${tokensUsed} tokens)`,
    );

    return {
      summary,
      tokensUsed,
      durationMs,
    };
  }

  /**
   * Generate summaries for multiple parent chunks in batches
   * @param chunks - Array of parent chunks
   * @returns Map of chunk ID to summary result
   */
  async batchGenerateSummaries(
    chunks: EnrichedParentChunk[],
  ): Promise<Map<string, SummaryResult>> {
    if (!this.model) {
      return new Map(); // LLM enrichment disabled
    }

    const results = new Map<string, SummaryResult>();
    const batchSize = parseInt(
      this.configService.get<string>('SUMMARY_BATCH_SIZE') ?? '5',
      10,
    );

    let successCount = 0;
    let failedCount = 0;

    this.logger.log(
      `Generating summaries for ${chunks.length} chunks in batches of ${batchSize}`,
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
          const result = await this.generateSummary(chunk);
          return { chunkId: chunk.id, result };
        }),
      );

      // Add successful results to map and track stats
      batchResults.forEach(({ chunkId, result }) => {
        if (result) {
          results.set(chunkId, result);
          successCount++;
        } else {
          failedCount++;
        }
      });

      this.logger.log(
        `Batch ${Math.floor(i / batchSize) + 1}: Generated ${batchResults.filter((r) => r.result).length}/${batch.length} summaries`,
      );
    }

    this.logger.log(
      `Summary generation completed: ${successCount} succeeded, ${failedCount} failed (gracefully skipped)`,
    );

    return results;
  }

  /**
   * Sleep helper for rate limiting and retry delays
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if summary generation is enabled
   */
  isEnabled(): boolean {
    return this.model !== null;
  }

  /**
   * Get total tokens used across all summaries
   */
  getTotalTokensUsed(summaries: Map<string, SummaryResult>): number {
    let total = 0;
    summaries.forEach((result) => {
      total += result.tokensUsed;
    });
    return total;
  }

  /**
   * Get average generation time
   */
  getAverageDuration(summaries: Map<string, SummaryResult>): number {
    if (summaries.size === 0) {
      return 0;
    }

    let total = 0;
    summaries.forEach((result) => {
      total += result.durationMs;
    });

    return Math.round(total / summaries.size);
  }
}
