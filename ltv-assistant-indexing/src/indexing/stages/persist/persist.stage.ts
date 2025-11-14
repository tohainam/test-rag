/**
 * Persist Stage - Main Orchestrator
 * Coordinates persistence to MySQL and Qdrant with ALL-OR-NOTHING transactional integrity
 * Based on specs from docs/plans/persist-stage.md - ĐC-4
 */

import { Injectable, Logger } from '@nestjs/common';
import { MySQLPersistenceService } from './services/mysql-persistence.service';
import { QdrantPersistenceService } from './services/qdrant-persistence.service';
import type { PersistInputDto, PersistOutputDto } from './dto';
import type { RollbackContext, ParentChunkMetadata } from './types';
import { PersistStageError } from './errors';

@Injectable()
export class PersistStage {
  private readonly logger = new Logger(PersistStage.name);

  constructor(
    private readonly mysqlPersistenceService: MySQLPersistenceService,
    private readonly qdrantPersistenceService: QdrantPersistenceService,
  ) {}

  /**
   * Execute Persist Stage workflow with transaction management
   * Based on persist-stage.md - ĐC-4: ALL OR NOTHING principle
   *
   * Workflow:
   * 1. MySQL persistence (with Drizzle transaction)
   * 2. Qdrant persistence (multi-vector batch upsert)
   * 3. If ANY fails → ROLLBACK ALL → Cleanup both databases
   */
  async execute(input: PersistInputDto): Promise<PersistOutputDto> {
    this.logger.log(
      `Starting Persist Stage for document ${input.documentId}: ` +
        `${input.embeddedChildren.length} child chunks, ` +
        `${input.embeddedSummaries?.length || 0} summaries, ` +
        `${input.embeddedQuestions?.length || 0} questions`,
    );

    const startTime = Date.now();
    const rollbackContext: RollbackContext = {
      documentId: input.documentId,
      fileId: input.fileId,
      mysqlSuccess: false,
      qdrantSuccess: false,
      qdrantVectorsInserted: {
        childrenCount: 0,
        summariesCount: 0,
        questionsCount: 0,
      },
    };

    try {
      // ============================================
      // Step 1: Persist to MySQL (with transaction)
      // ============================================
      this.logger.log('Step 1/3: Persisting to MySQL...');

      // Extract parent chunks metadata (no embeddings for MySQL)
      const parentChunksMetadata: ParentChunkMetadata[] =
        input.parentChunksMetadata.map((parent) => ({
          id: parent.id,
          documentId: parent.documentId,
          fileId: parent.fileId,
          content: parent.content,
          tokens: parent.tokens,
          chunkIndex: parent.chunkIndex,
          metadata: parent.metadata as unknown as Record<string, unknown>,
        }));

      const mysqlResult = await this.mysqlPersistenceService.persist({
        fileId: input.fileId,
        parentChunks: parentChunksMetadata,
        childChunks: input.embeddedChildren,
        lineage: input.lineage,
      });

      if (!mysqlResult.success) {
        throw new PersistStageError(
          `MySQL persistence failed: ${mysqlResult.error}`,
        );
      }
      rollbackContext.mysqlSuccess = true;

      // ============================================
      // Step 2: Persist to Qdrant (multi-vector)
      // ============================================
      this.logger.log('Step 2/3: Persisting to Qdrant...');

      const qdrantResult = await this.qdrantPersistenceService.persist({
        documentId: input.documentId,
        fileId: input.fileId,
        embeddedChildren: input.embeddedChildren,
        embeddedSummaries: input.embeddedSummaries,
        embeddedQuestions: input.embeddedQuestions,
      });

      if (!qdrantResult.success) {
        throw new PersistStageError(
          `Qdrant persistence failed: ${qdrantResult.error}`,
        );
      }
      rollbackContext.qdrantSuccess = true;
      rollbackContext.qdrantVectorsInserted = {
        childrenCount: qdrantResult.childrenVectorsInserted,
        summariesCount: qdrantResult.summariesVectorsInserted,
        questionsCount: qdrantResult.questionsVectorsInserted,
      };

      // ============================================
      // All success! ✅
      // ============================================
      const totalDurationMs = Date.now() - startTime;

      this.logger.log(
        `✅ Persist Stage completed successfully in ${totalDurationMs}ms: ` +
          `MySQL (${mysqlResult.childChunksInserted} chunks), ` +
          `Qdrant (${qdrantResult.childrenVectorsInserted} vectors)`,
      );

      return {
        success: true,
        mysql: mysqlResult,
        qdrant: qdrantResult,
        totalDurationMs,
        rollbackPerformed: false,
        errors: [],
      };
    } catch (error: unknown) {
      // ============================================
      // Error occurred - perform rollback ❌
      // ============================================
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`❌ Persist Stage failed: ${errorMessage}`, errorStack);

      const rollbackResult = await this.performRollback(rollbackContext);

      const totalDurationMs = Date.now() - startTime;

      return {
        success: false,
        mysql: {
          success: rollbackContext.mysqlSuccess,
          documentsInserted: 0,
          parentChunksInserted: 0,
          childChunksInserted: 0,
          lineageInserted: 0,
          durationMs: 0,
          error: rollbackContext.mysqlSuccess ? undefined : 'Failed',
        },
        qdrant: {
          success: rollbackContext.qdrantSuccess,
          childrenVectorsInserted: 0,
          summariesVectorsInserted: 0,
          questionsVectorsInserted: 0,
          durationMs: 0,
          error: rollbackContext.qdrantSuccess ? undefined : 'Failed',
        },
        totalDurationMs,
        rollbackPerformed: true,
        errors: [errorMessage, ...rollbackResult.errors],
      };
    }
  }

  /**
   * Perform complete rollback across supported databases
   * Based on persist-stage.md - YN-4: Rollback mechanism
   *
   * Rollback order: Qdrant → MySQL (reverse order)
   * - MySQL: Transaction auto-rollback
   * - Qdrant: Manual cleanup (no transactions)
   */
  private async performRollback(context: RollbackContext): Promise<{
    success: boolean;
    errors: string[];
  }> {
    this.logger.warn(
      `🔄 Starting rollback for document ${context.documentId}...`,
    );

    const errors: string[] = [];

    // ============================================
    // 1. Qdrant cleanup (if started)
    // ============================================
    if (context.qdrantSuccess) {
      try {
        await this.qdrantPersistenceService.cleanup(context.fileId);
        this.logger.log('Qdrant cleanup successful');
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push(`Qdrant cleanup failed: ${errorMessage}`);
        this.logger.error(`Qdrant cleanup failed: ${errorMessage}`);
      }
    }

    // ============================================
    // 2. MySQL cleanup (transaction should auto-rollback, manual for safety)
    // ============================================
    if (context.mysqlSuccess) {
      try {
        await this.mysqlPersistenceService.cleanup(context.fileId);
        this.logger.log('MySQL cleanup successful');
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push(`MySQL cleanup failed: ${errorMessage}`);
        this.logger.error(`MySQL cleanup failed: ${errorMessage}`);
      }
    }

    // ============================================
    // Result
    // ============================================
    if (errors.length === 0) {
      this.logger.log(
        `✅ Rollback completed successfully for document ${context.documentId}`,
      );
      return { success: true, errors: [] };
    } else {
      this.logger.error(
        `⚠️ Rollback completed with errors for document ${context.documentId}: ${errors.join('; ')}`,
      );
      return { success: false, errors };
    }
  }
}
