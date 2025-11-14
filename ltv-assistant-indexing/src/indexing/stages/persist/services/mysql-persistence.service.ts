/**
 * MySQL Persistence Service
 * Persists document metadata and chunks to MySQL using Drizzle ORM
 * Based on specs from docs/plans/persist-stage.md - ĐC-1 (Drizzle ORM - 2025 Best Practice)
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../../../database/database.module';
import {
  parentChunks,
  childChunks,
  chunkLineage,
  type NewParentChunk,
  type NewChildChunk,
  type NewChunkLineage,
} from '../../../../database/schema';
import type { MySQLPersistenceResult, ParentChunkMetadata } from '../types';
import type { ChildChunkWithEmbedding } from '../../embed/types';
import { MySQLPersistenceError } from '../errors';

interface MySQLPersistenceInput {
  fileId: string;
  parentChunks: ParentChunkMetadata[];
  childChunks: ChildChunkWithEmbedding[];
  lineage: Array<{
    id: string;
    parentChunkId: string;
    childChunkId: string;
    childOrder: number;
  }>;
}

@Injectable()
export class MySQLPersistenceService {
  private readonly logger = new Logger(MySQLPersistenceService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: MySql2Database,
  ) {}

  /**
   * Persist chunks and lineage to MySQL with Drizzle transaction
   * File metadata is managed by ltv-assistant-datasource service
   * Uses Drizzle's db.transaction() - auto-commit on success, auto-rollback on error
   * Based on persist-stage.md - ĐC-1
   */
  async persist(input: MySQLPersistenceInput): Promise<MySQLPersistenceResult> {
    const startTime = Date.now();

    try {
      // Drizzle transaction: auto-commit on success, auto-rollback on error
      const result = await this.db.transaction(async (tx) => {
        this.logger.log(`MySQL transaction started for file ${input.fileId}`);

        // 1. Handle deduplication (delete old chunks if exist)
        await this.handleDeduplication(tx, input.fileId);

        // 2. Batch insert parent chunks
        const parentChunksInserted = await this.batchInsertParentChunks(
          tx,
          input.fileId,
          input.parentChunks,
        );

        // 3. Batch insert child chunks
        const childChunksInserted = await this.batchInsertChildChunks(
          tx,
          input.fileId,
          input.childChunks,
        );

        // 4. Batch insert lineage
        const lineageInserted = await this.batchInsertLineage(
          tx,
          input.lineage,
        );

        return { parentChunksInserted, childChunksInserted, lineageInserted };
      });

      // Transaction auto-committed
      this.logger.log(`MySQL transaction committed for file ${input.fileId}`);

      const durationMs = Date.now() - startTime;

      return {
        success: true,
        documentsInserted: 1,
        parentChunksInserted: result.parentChunksInserted,
        childChunksInserted: result.childChunksInserted,
        lineageInserted: result.lineageInserted,
        durationMs,
      };
    } catch (error: unknown) {
      // Transaction auto-rolled back by Drizzle
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Extract MySQL-specific error details - check multiple possible error structures
      let detailedError = errorMessage;
      const errorDetails: string[] = [];

      // Helper to extract error properties from any error object
      const extractErrorProps = (err: Record<string, unknown>, prefix = '') => {
        if (typeof err.code === 'string') {
          errorDetails.push(`${prefix}Code: ${err.code}`);
        }
        if (typeof err.errno === 'number') {
          errorDetails.push(`${prefix}Errno: ${err.errno}`);
        }
        if (typeof err.sqlState === 'string') {
          errorDetails.push(`${prefix}SQLState: ${err.sqlState}`);
        }
        if (typeof err.sqlMessage === 'string') {
          errorDetails.push(`${prefix}SQLMessage: ${err.sqlMessage}`);
        }
      };

      if (error && typeof error === 'object') {
        const mysqlError = error as Record<string, unknown>;

        // Check direct properties
        extractErrorProps(mysqlError);

        // Check if error has a cause (nested error from Drizzle)
        if (mysqlError.cause && typeof mysqlError.cause === 'object') {
          extractErrorProps(
            mysqlError.cause as Record<string, unknown>,
            'Cause ',
          );
        }

        // Check if error is wrapped in an innerError property
        if (
          mysqlError.innerError &&
          typeof mysqlError.innerError === 'object'
        ) {
          extractErrorProps(
            mysqlError.innerError as Record<string, unknown>,
            'Inner ',
          );
        }

        // If no details found, log the full error structure for debugging
        if (errorDetails.length === 0) {
          try {
            const errorKeys = Object.keys(mysqlError);
            this.logger.error(
              `Error object keys: ${errorKeys.join(', ')}. Full error:`,
              JSON.stringify(mysqlError, null, 2),
            );
          } catch {
            this.logger.error('Could not serialize error object');
          }
        }

        if (errorDetails.length > 0) {
          detailedError += ` [${errorDetails.join(', ')}]`;
        }
      }

      this.logger.error(
        `MySQL transaction failed: ${detailedError}`,
        errorStack,
      );

      throw new MySQLPersistenceError(
        detailedError,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Handle deduplication: delete old chunks if exist for this file
   * Checks by fileId - same file being re-indexed should replace old chunks
   * Based on persist-stage.md - YN-5
   */
  private async handleDeduplication(
    tx: MySql2Database,
    fileId: string,
  ): Promise<void> {
    // Check if parent chunks already exist for this fileId
    const existingParents = await tx
      .select()
      .from(parentChunks)
      .where(eq(parentChunks.fileId, fileId))
      .limit(1);

    if (existingParents.length > 0) {
      this.logger.warn(
        `Chunks for file ${fileId} already exist, deleting old data for re-indexing`,
      );

      // Delete parent chunks (cascade will handle child chunks and lineage)
      await tx.delete(parentChunks).where(eq(parentChunks.fileId, fileId));
      this.logger.log('Old chunk data deleted from MySQL');
    }
  }

  /**
   * Batch insert parent chunks using Drizzle
   * Based on persist-stage.md - YN-6 (Batch size: 100)
   */
  private async batchInsertParentChunks(
    tx: MySql2Database,
    fileId: string,
    parentChunksList: ParentChunkMetadata[],
  ): Promise<number> {
    const BATCH_SIZE = 100;
    let totalInserted = 0;

    for (let i = 0; i < parentChunksList.length; i += BATCH_SIZE) {
      const batch = parentChunksList.slice(i, i + BATCH_SIZE);

      const values: NewParentChunk[] = batch.map((chunk) => ({
        id: chunk.id,
        fileId,
        content: chunk.content,
        tokens: chunk.tokens,
        chunkIndex: chunk.chunkIndex || 0,
        metadata: chunk.metadata,
        createdAt: new Date(),
      }));

      await tx.insert(parentChunks).values(values);

      totalInserted += batch.length;
      this.logger.log(
        `Inserted parent chunks batch: ${totalInserted}/${parentChunksList.length}`,
      );
    }

    return totalInserted;
  }

  /**
   * Batch insert child chunks using Drizzle
   * Based on persist-stage.md - YN-6 (Batch size: 100)
   */
  private async batchInsertChildChunks(
    tx: MySql2Database,
    fileId: string,
    childChunksList: ChildChunkWithEmbedding[],
  ): Promise<number> {
    const BATCH_SIZE = 100;
    let totalInserted = 0;

    for (let i = 0; i < childChunksList.length; i += BATCH_SIZE) {
      const batch = childChunksList.slice(i, i + BATCH_SIZE);

      const values: NewChildChunk[] = batch.map((chunk) => ({
        id: chunk.id,
        fileId,
        parentChunkId: chunk.parentChunkId,
        content: chunk.content,
        tokens: chunk.tokens,
        chunkIndex: chunk.chunkIndex || 0,
        metadata: chunk.metadata,
        createdAt: new Date(),
      }));

      await tx.insert(childChunks).values(values);

      totalInserted += batch.length;
      this.logger.log(
        `Inserted child chunks batch: ${totalInserted}/${childChunksList.length}`,
      );
    }

    return totalInserted;
  }

  /**
   * Batch insert chunk lineage using Drizzle
   * Based on persist-stage.md - YN-6 (Batch size: 100)
   */
  private async batchInsertLineage(
    tx: MySql2Database,
    lineageList: MySQLPersistenceInput['lineage'],
  ): Promise<number> {
    const BATCH_SIZE = 100;
    let totalInserted = 0;

    for (let i = 0; i < lineageList.length; i += BATCH_SIZE) {
      const batch = lineageList.slice(i, i + BATCH_SIZE);

      const values: NewChunkLineage[] = batch.map((item) => ({
        parentChunkId: item.parentChunkId,
        childChunkId: item.childChunkId,
        childOrder: item.childOrder || 0,
        createdAt: new Date(),
      }));

      await tx.insert(chunkLineage).values(values);

      totalInserted += batch.length;
    }

    this.logger.log(`Inserted ${totalInserted} lineage records`);
    return totalInserted;
  }

  /**
   * Cleanup: manual cleanup (called from PersistStageService for rollback)
   * Using Drizzle delete operation
   * Based on persist-stage.md - YN-4
   */
  async cleanup(fileId: string): Promise<void> {
    try {
      // Delete parent chunks (cascade will handle child chunks and lineage)
      await this.db.delete(parentChunks).where(eq(parentChunks.fileId, fileId));
      this.logger.log(`Cleaned up chunk data for file ${fileId}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`MySQL cleanup failed: ${errorMessage}`);
      if (error instanceof Error) {
        throw error;
      }
      throw new MySQLPersistenceError(errorMessage);
    }
  }
}
