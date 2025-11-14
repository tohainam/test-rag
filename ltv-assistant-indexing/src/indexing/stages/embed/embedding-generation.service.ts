/**
 * Embedding Generation Service
 * Dense embedding generation with batch processing and retry logic
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Embeddings } from '@langchain/core/embeddings';
import { EmbeddingProviderFactory } from './embedding-provider.factory';
import type { BatchResult } from './types';

interface ChunkLike {
  id: string;
  content: string;
}

interface EmbeddingResult {
  id: string;
  embedding: number[] | null;
  error?: string;
}

@Injectable()
export class EmbeddingGenerationService {
  private readonly logger = new Logger(EmbeddingGenerationService.name);

  private embeddingModel: Embeddings;
  private readonly batchSize: number;
  private readonly maxConcurrentBatches: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly embeddingProviderFactory: EmbeddingProviderFactory,
    private readonly configService: ConfigService,
  ) {
    this.embeddingModel = this.embeddingProviderFactory.createEmbeddingModel();

    // Helper to coerce config values to finite numbers
    const toNumber = (value: unknown, defaultValue: number): number => {
      const n = Number(value);
      return Number.isFinite(n) ? n : defaultValue;
    };

    // Batch configuration (force numeric)
    const batchSizeRaw = toNumber(
      this.configService.get('EMBEDDING_BATCH_SIZE'),
      24,
    );
    const maxConcurrentRaw = toNumber(
      this.configService.get('EMBEDDING_MAX_CONCURRENT_BATCHES'),
      2,
    );
    this.batchSize = Math.max(1, Math.floor(batchSizeRaw));
    this.maxConcurrentBatches = Math.max(1, Math.floor(maxConcurrentRaw));

    // Retry configuration
    this.maxRetries = toNumber(
      this.configService.get('EMBEDDING_MAX_RETRIES'),
      3,
    );
    this.retryDelayMs = toNumber(
      this.configService.get('EMBEDDING_RETRY_DELAY_MS'),
      1500,
    );

    // Timeout configuration
    this.timeoutMs = toNumber(
      this.configService.get('EMBEDDING_TIMEOUT_MS'),
      60000, // Default 60 seconds (increased from 30)
    );

    this.logger.log(
      `Initialized with batch size: ${this.batchSize}, ` +
        `max concurrent batches: ${this.maxConcurrentBatches}, ` +
        `max retries: ${this.maxRetries}, ` +
        `timeout: ${this.timeoutMs}ms`,
    );
    // Defensive validation logs
    if (batchSizeRaw !== this.batchSize) {
      this.logger.warn(
        `Adjusted EMBEDDING_BATCH_SIZE from ${batchSizeRaw} to ${this.batchSize}`,
      );
    }
    if (maxConcurrentRaw !== this.maxConcurrentBatches) {
      this.logger.warn(
        `Adjusted EMBEDDING_MAX_CONCURRENT_BATCHES from ${maxConcurrentRaw} to ${this.maxConcurrentBatches}`,
      );
    }
  }

  /**
   * Generate embeddings for multiple chunks with batch processing
   */
  async generateEmbeddings(chunks: ChunkLike[]): Promise<BatchResult> {
    const startTime = Date.now();

    this.logger.log(
      `Starting embedding generation for ${chunks.length} chunks...`,
    );

    // Create batches
    const batches = this.createBatches(chunks, this.batchSize);

    this.logger.log(
      `Split into ${batches.length} batches (batch size: ${this.batchSize})`,
    );

    // Process batches with concurrency limit
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < batches.length; i += this.maxConcurrentBatches) {
      const batchGroup = batches.slice(i, i + this.maxConcurrentBatches);

      const groupResults = await Promise.all(
        batchGroup.map((batch, idx) => {
          const batchNumber = i + idx + 1;
          return this.processBatch(batch, batchNumber, batches.length);
        }),
      );

      results.push(...groupResults.flat());
    }

    // Separate successful and failed
    const successful = results
      .filter((r) => r.embedding !== null)
      .map((r) => ({ id: r.id, embedding: r.embedding! }));

    const failed = results
      .filter((r) => r.embedding === null)
      .map((r) => ({ id: r.id, error: r.error || 'Unknown error' }));

    const durationMs = Date.now() - startTime;

    this.logger.log(
      `Embedding generation completed: ${successful.length}/${chunks.length} successful, ` +
        `${failed.length} failed (${durationMs}ms)`,
    );

    if (failed.length > 0) {
      this.logger.warn(`Failed chunks: ${failed.map((f) => f.id).join(', ')}`);
    }

    return {
      successful,
      failed,
      durationMs,
    };
  }

  /**
   * Create batches from chunks
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Process a single batch
   */
  private async processBatch(
    batch: ChunkLike[],
    batchNum: number,
    totalBatches: number,
  ): Promise<EmbeddingResult[]> {
    this.logger.log(
      JSON.stringify({
        stage: 'embed',
        event: 'batch_start',
        batchNum,
        totalBatches,
        chunkCount: batch.length,
      }),
    );

    const results = await Promise.all(
      batch.map((chunk) => this.embedChunkWithRetry(chunk)),
    );

    const successCount = results.filter((r) => r.embedding !== null).length;

    this.logger.log(
      JSON.stringify({
        stage: 'embed',
        event: 'batch_done',
        batchNum,
        totalBatches,
        success: successCount,
        total: batch.length,
      }),
    );

    return results;
  }

  /**
   * Embed a single chunk with retry logic
   */
  private async embedChunkWithRetry(
    chunk: ChunkLike,
  ): Promise<EmbeddingResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Add timeout protection
        const embedding = await this.embedWithTimeout(
          chunk.content,
          this.timeoutMs,
        );

        return {
          id: chunk.id,
          embedding,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);

          this.logger.error(
            JSON.stringify({
              error: lastError.message,
              errorName: lastError.name,
              stack: lastError.stack,
              chunkId: chunk.id,
              contentLength: chunk.content.length,
            }),
          );

          this.logger.warn(
            `Chunk ${chunk.id} failed (attempt ${attempt}/${this.maxRetries}), ` +
              `retrying in ${delay}ms..`,
          );

          await this.sleep(delay);
        } else {
          this.logger.error(
            JSON.stringify({
              error: lastError.message,
              errorName: lastError.name,
              stack: lastError.stack,
              chunkId: chunk.id,
              contentLength: chunk.content.length,
            }),
          );
          // Log final attempt failure with full details
          this.logger.error(
            `Chunk ${chunk.id} failed on final attempt ${attempt}/${this.maxRetries}`,
          );
        }
      }
    }

    this.logger.error(
      `Failed to embed chunk ${chunk.id} after ${this.maxRetries} attempts: ${lastError?.message}`,
      {
        error: lastError?.message,
        errorName: lastError?.name,
        stack: lastError?.stack,
        chunkId: chunk.id,
        contentLength: chunk.content.length,
      },
    );

    return {
      id: chunk.id,
      embedding: null,
      error: lastError?.message || 'Unknown error',
    };
  }

  /**
   * Embed with timeout protection
   */
  private async embedWithTimeout(
    text: string,
    timeoutMs: number,
  ): Promise<number[]> {
    return Promise.race([
      this.embeddingModel.embedQuery(text),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Embedding timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get embedding dimensions
   */
  getEmbeddingDimensions(): number {
    return this.embeddingProviderFactory.getEmbeddingDimensions();
  }
}
