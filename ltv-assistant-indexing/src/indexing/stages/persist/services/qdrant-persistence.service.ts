/**
 * Qdrant Multi-Vector Persistence Service
 * Persists multi-vector embeddings (children, summaries, questions) to Qdrant
 * Based on specs from docs/plans/persist-stage.md - ĐC-2 (Named Vectors - 2025 Best Practice)
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_CLIENT } from '../persist.constants';
import type { QdrantPersistenceResult } from '../types';
import type {
  ChildChunkWithEmbedding,
  SummaryWithEmbedding,
  HypotheticalQuestionWithEmbedding,
} from '../../embed/types';
import { QdrantPersistenceError } from '../errors';
import * as crypto from 'crypto';

interface QdrantPersistenceInput {
  documentId: string;
  fileId: string;
  embeddedChildren: ChildChunkWithEmbedding[];
  embeddedSummaries?: SummaryWithEmbedding[];
  embeddedQuestions?: HypotheticalQuestionWithEmbedding[];
}

@Injectable()
export class QdrantPersistenceService {
  private readonly logger = new Logger(QdrantPersistenceService.name);

  // Collection names (hardcoded - must match retrieval service)
  private readonly COLLECTION_CHILDREN = 'documents_children';
  private readonly COLLECTION_SUMMARIES = 'documents_summaries';
  private readonly COLLECTION_QUESTIONS = 'documents_questions';

  // Batch size for vector operations
  private readonly BATCH_SIZE = 100;

  constructor(
    @Inject(QDRANT_CLIENT) private readonly qdrantClient: QdrantClient,
  ) {}

  /**
   * Convert string ID to UUID v5 (deterministic UUID from string)
   * Qdrant requires UUIDs or unsigned integers as point IDs
   */
  private stringToUuid(str: string): string {
    // Use MD5 hash to create a deterministic UUID v4-like format
    const hash = crypto.createHash('md5').update(str).digest('hex');
    // Format as UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    return `${hash.substr(0, 8)}-${hash.substr(8, 4)}-4${hash.substr(13, 3)}-${((parseInt(hash.substr(16, 2), 16) & 0x3f) | 0x80).toString(16)}${hash.substr(18, 2)}-${hash.substr(20, 12)}`;
  }

  /**
   * Persist multi-vector embeddings to Qdrant
   * Based on persist-stage.md - ĐC-2
   */
  async persist(
    input: QdrantPersistenceInput,
  ): Promise<QdrantPersistenceResult> {
    const startTime = Date.now();

    try {
      // 1. Handle deduplication: delete old vectors by fileId
      await this.handleDeduplication(input.fileId);

      // 2. Upsert child chunk vectors (REQUIRED)
      const childrenVectorsInserted = await this.upsertChildChunkVectors(
        input.documentId,
        input.fileId,
        input.embeddedChildren,
      );

      // 3. Upsert summary vectors (if enabled)
      let summariesVectorsInserted = 0;
      if (input.embeddedSummaries && input.embeddedSummaries.length > 0) {
        summariesVectorsInserted = await this.upsertSummaryVectors(
          input.documentId,
          input.fileId,
          input.embeddedSummaries,
        );
      }

      // 4. Upsert question vectors (if enabled)
      let questionsVectorsInserted = 0;
      if (input.embeddedQuestions && input.embeddedQuestions.length > 0) {
        questionsVectorsInserted = await this.upsertQuestionVectors(
          input.documentId,
          input.fileId,
          input.embeddedQuestions,
        );
      }

      const durationMs = Date.now() - startTime;

      this.logger.log(
        `Qdrant persistence completed: ${childrenVectorsInserted} children, ` +
          `${summariesVectorsInserted} summaries, ${questionsVectorsInserted} questions in ${durationMs}ms`,
      );

      return {
        success: true,
        childrenVectorsInserted,
        summariesVectorsInserted,
        questionsVectorsInserted,
        durationMs,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Qdrant persistence failed: ${errorMessage}`,
        errorStack,
      );

      throw new QdrantPersistenceError(
        errorMessage,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Handle deduplication: delete old vectors by file_id
   * Based on persist-stage.md - YN-5
   *
   * IMPORTANT: Filter by fileId, not documentId!
   * One document can have many files. We only delete the current file's vectors.
   */
  private async handleDeduplication(fileId: string): Promise<void> {
    try {
      // Delete from all collections by fileId
      await this.qdrantClient.delete(this.COLLECTION_CHILDREN, {
        filter: {
          must: [{ key: 'fileId', match: { value: fileId } }],
        },
      });

      await this.qdrantClient.delete(this.COLLECTION_SUMMARIES, {
        filter: {
          must: [{ key: 'fileId', match: { value: fileId } }],
        },
      });

      await this.qdrantClient.delete(this.COLLECTION_QUESTIONS, {
        filter: {
          must: [{ key: 'fileId', match: { value: fileId } }],
        },
      });

      this.logger.log(`Deleted old vectors for file ${fileId}`);
    } catch (error: unknown) {
      // Ignore errors if collections don't exist or no vectors found
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(`Deduplication warning: ${errorMessage}`);
    }
  }

  /**
   * Batch upsert child chunk vectors
   * Uses named vectors (2025 best practice): "dense" and "sparse"
   * Based on persist-stage.md - YN-2
   */
  private async upsertChildChunkVectors(
    documentId: string,
    fileId: string,
    embeddedChildren: ChildChunkWithEmbedding[],
  ): Promise<number> {
    const BATCH_SIZE = this.BATCH_SIZE;
    let totalInserted = 0;

    for (let i = 0; i < embeddedChildren.length; i += BATCH_SIZE) {
      const batch = embeddedChildren.slice(i, i + BATCH_SIZE);

      // Qdrant 2025: Named vectors for multi-vector search
      // Each point can have multiple named vectors (dense, sparse, etc.)
      const points = batch.map((chunk) => ({
        id: this.stringToUuid(chunk.id), // Convert string ID to UUID
        vector: {
          // Named vector: "dense" for semantic search
          dense: chunk.denseEmbedding,
          // Named vector: "sparse" for keyword/hybrid search
          sparse: {
            indices: chunk.sparseEmbedding.indices,
            values: chunk.sparseEmbedding.values,
          },
        },
        payload: {
          chunkId: chunk.id, // Store original chunk ID in payload
          documentId,
          fileId, // CRITICAL: Store fileId for filtering
          parentChunkId: chunk.parentChunkId,
          content: chunk.content,
          tokens: chunk.tokens,
          metadata: chunk.metadata,
        },
      }));

      // Batch upsert with wait=true for consistency
      try {
        await this.qdrantClient.upsert(this.COLLECTION_CHILDREN, {
          wait: true, // Wait for operation to complete
          points,
          ordering: 'weak', // 2025: Use weak ordering for better performance
        });
      } catch (error: unknown) {
        // Log the actual error details and first point for debugging
        this.logger.error(
          `Qdrant upsert failed. Error: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.logger.error(
          `First point structure: ${JSON.stringify(points[0], null, 2)}`,
        );
        throw error;
      }

      totalInserted += batch.length;
      this.logger.log(
        `Upserted child vectors batch: ${totalInserted}/${embeddedChildren.length}`,
      );
    }

    return totalInserted;
  }

  /**
   * Batch upsert summary vectors
   * Based on persist-stage.md - YN-2
   */
  private async upsertSummaryVectors(
    documentId: string,
    fileId: string,
    embeddedSummaries: SummaryWithEmbedding[],
  ): Promise<number> {
    const BATCH_SIZE = this.BATCH_SIZE;
    let totalInserted = 0;

    for (let i = 0; i < embeddedSummaries.length; i += BATCH_SIZE) {
      const batch = embeddedSummaries.slice(i, i + BATCH_SIZE);

      const points = batch.map((summary) => ({
        id: this.stringToUuid(summary.id), // Convert string ID to UUID
        vector: {
          dense: summary.denseEmbedding,
          sparse: {
            indices: summary.sparseEmbedding.indices,
            values: summary.sparseEmbedding.values,
          },
        },
        payload: {
          summaryId: summary.id, // Store original summary ID in payload
          documentId,
          fileId, // CRITICAL: Store fileId for filtering
          parentChunkId: summary.parentChunkId,
          summary: summary.summary,
          metadata: {}, // Summary metadata (can be extended later)
        },
      }));

      await this.qdrantClient.upsert(this.COLLECTION_SUMMARIES, {
        wait: true,
        points,
        ordering: 'weak',
      });

      totalInserted += batch.length;
    }

    this.logger.log(`Upserted ${totalInserted} summary vectors`);
    return totalInserted;
  }

  /**
   * Batch upsert question vectors
   * Based on persist-stage.md - YN-2
   */
  private async upsertQuestionVectors(
    documentId: string,
    fileId: string,
    embeddedQuestions: HypotheticalQuestionWithEmbedding[],
  ): Promise<number> {
    const BATCH_SIZE = this.BATCH_SIZE;
    let totalInserted = 0;

    for (let i = 0; i < embeddedQuestions.length; i += BATCH_SIZE) {
      const batch = embeddedQuestions.slice(i, i + BATCH_SIZE);

      const points = batch.map((question) => ({
        id: this.stringToUuid(question.id), // Convert string ID to UUID
        vector: {
          dense: question.denseEmbedding,
          sparse: {
            indices: question.sparseEmbedding.indices,
            values: question.sparseEmbedding.values,
          },
        },
        payload: {
          questionId: question.id, // Store original question ID in payload
          documentId,
          fileId, // CRITICAL: Store fileId for filtering
          parentChunkId: question.parentChunkId,
          question: question.question,
          metadata: {}, // Question metadata (can be extended later)
        },
      }));

      await this.qdrantClient.upsert(this.COLLECTION_QUESTIONS, {
        wait: true,
        points,
        ordering: 'weak',
      });

      totalInserted += batch.length;
    }

    this.logger.log(`Upserted ${totalInserted} question vectors`);
    return totalInserted;
  }

  /**
   * Cleanup: delete all vectors by file_id (for rollback)
   * Based on persist-stage.md - YN-4
   *
   * IMPORTANT: Filter by fileId, not documentId!
   * One document can have many files. We only cleanup the current file's vectors.
   */
  async cleanup(fileId: string): Promise<void> {
    try {
      await this.qdrantClient.delete(this.COLLECTION_CHILDREN, {
        filter: {
          must: [{ key: 'fileId', match: { value: fileId } }],
        },
      });

      await this.qdrantClient.delete(this.COLLECTION_SUMMARIES, {
        filter: {
          must: [{ key: 'fileId', match: { value: fileId } }],
        },
      });

      await this.qdrantClient.delete(this.COLLECTION_QUESTIONS, {
        filter: {
          must: [{ key: 'fileId', match: { value: fileId } }],
        },
      });

      this.logger.log(`Cleaned up Qdrant vectors for file ${fileId}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Qdrant cleanup failed: ${errorMessage}`);
      if (error instanceof Error) {
        throw error;
      }
      throw new QdrantPersistenceError(errorMessage);
    }
  }
}
