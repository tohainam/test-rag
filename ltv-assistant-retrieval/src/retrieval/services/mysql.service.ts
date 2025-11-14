/**
 * MySQL Service
 * Handles parent chunk retrieval from MySQL database
 * Reference: PRD Section "Context Assembly Service" (Lines 997-1136)
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { inArray } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import type { ParentChunk } from '../types';

@Injectable()
export class MySQLService {
  private readonly logger = new Logger(MySQLService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: MySql2Database<typeof schema>,
  ) {
    this.logger.log('MySQLService initialized');
  }

  /**
   * Fetch parent chunks by IDs
   * @param parentChunkIds - Array of parent chunk IDs
   * @returns Array of ParentChunk objects
   */
  async fetchParentChunks(parentChunkIds: string[]): Promise<ParentChunk[]> {
    if (parentChunkIds.length === 0) {
      this.logger.log('No parent chunk IDs provided, returning empty array');
      return [];
    }

    try {
      this.logger.log(
        `Fetching ${parentChunkIds.length} parent chunks from MySQL`,
      );

      const parentChunks = await this.db
        .select()
        .from(schema.parentChunks)
        .where(inArray(schema.parentChunks.id, parentChunkIds));

      this.logger.log(
        `Fetched ${parentChunks.length} parent chunks from database`,
      );

      return parentChunks;
    } catch (error) {
      this.logger.error(
        `Failed to fetch parent chunks: ${error instanceof Error ? error.message : String(error)}`,
      );
      return []; // Graceful fallback
    }
  }

  /**
   * Fetch parent chunks by file IDs (for metadata search results)
   * @param fileIds - Array of file IDs from document metadata search
   * @returns Array of parent chunks with their IDs
   */
  async fetchParentChunksByFileIds(
    fileIds: string[],
  ): Promise<Array<{ id: string; fileId: string; content: string }>> {
    if (fileIds.length === 0) {
      this.logger.log('No file IDs provided, returning empty array');
      return [];
    }

    try {
      this.logger.log(`Fetching parent chunks for ${fileIds.length} file IDs`);

      const parentChunks = await this.db
        .select({
          id: schema.parentChunks.id,
          fileId: schema.parentChunks.fileId,
          content: schema.parentChunks.content,
        })
        .from(schema.parentChunks)
        .where(inArray(schema.parentChunks.fileId, fileIds));

      this.logger.log(
        `Fetched ${parentChunks.length} parent chunks for ${fileIds.length} files`,
      );

      return parentChunks;
    } catch (error) {
      this.logger.error(
        `Failed to fetch parent chunks by file IDs: ${error instanceof Error ? error.message : String(error)}`,
      );
      return []; // Graceful fallback
    }
  }

  /**
   * Health check for MySQL connection
   * @returns true if database is accessible, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.db.select().from(schema.parentChunks).limit(1);
      this.logger.log('MySQL health check: OK');
      return true;
    } catch (error) {
      this.logger.warn(
        `MySQL health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
