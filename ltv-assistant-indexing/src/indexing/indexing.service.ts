import { Injectable, Inject, Logger } from '@nestjs/common';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, sql, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_CONNECTION } from '../database/database.module';
import { indexingJobs, parentChunks, childChunks } from '../database/schema';
import * as schema from '../database/schema';
import {
  MySQLPersistenceService,
  QdrantPersistenceService,
} from './stages/persist/services';

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: MySql2Database<typeof schema>,
    private readonly mysqlPersistenceService: MySQLPersistenceService,
    private readonly qdrantPersistenceService: QdrantPersistenceService,
  ) {}

  async createJob(data: {
    fileId: string;
    documentId: string;
    filename: string;
    jobId: string;
  }): Promise<string> {
    const id = uuidv4();

    await this.db.insert(indexingJobs).values({
      id,
      fileId: data.fileId,
      documentId: data.documentId,
      filename: data.filename,
      jobId: data.jobId,
      status: 'pending',
    });

    this.logger.log(
      `Created indexing job record: ${id} for file: ${data.fileId}`,
    );

    return id;
  }

  async updateJobStatus(
    jobId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    error?: string,
  ): Promise<void> {
    const updateData: Record<string, unknown> = { status };

    if (status === 'processing') {
      updateData.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed') {
      updateData.completedAt = new Date();
    }

    if (error) {
      updateData.error = error;
    }

    await this.db
      .update(indexingJobs)
      .set(updateData)
      .where(eq(indexingJobs.jobId, jobId));

    this.logger.log(`Updated job ${jobId} status to: ${status}`);
  }

  async incrementAttempts(jobId: string): Promise<void> {
    const [job] = await this.db
      .select()
      .from(indexingJobs)
      .where(eq(indexingJobs.jobId, jobId));

    if (job) {
      await this.db
        .update(indexingJobs)
        .set({ attempts: job.attempts + 1 })
        .where(eq(indexingJobs.jobId, jobId));
    }
  }

  async getStatusByFileIds(fileIds: string[]): Promise<
    Array<{
      fileId: string;
      status: string;
      error: string | null;
      completedAt: Date | null;
    }>
  > {
    if (fileIds.length === 0) {
      return [];
    }

    const jobs = await this.db
      .select({
        fileId: indexingJobs.fileId,
        status: indexingJobs.status,
        error: indexingJobs.error,
        completedAt: indexingJobs.completedAt,
      })
      .from(indexingJobs)
      .where(
        sql`${indexingJobs.fileId} IN (${sql.join(
          fileIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );

    this.logger.log(
      `Retrieved indexing status for ${jobs.length}/${fileIds.length} files`,
    );

    return jobs.map((job) => ({
      fileId: job.fileId,
      status: job.status,
      error: job.error,
      completedAt: job.completedAt,
    }));
  }

  async getParentChunksByFileId(
    fileId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    chunks: Array<{
      id: string;
      fileId: string;
      content: string;
      tokens: number;
      chunkIndex: number;
      metadata: unknown;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;

    // Get total count
    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(parentChunks)
      .where(eq(parentChunks.fileId, fileId));

    const total = countResult?.count ?? 0;

    // Get chunks with pagination
    // Build query using SQL template with proper parameterization
    // db.execute() returns [rows, fields] tuple for mysql2
    type ParentChunkRow = {
      id: string;
      file_id: string;
      content: string;
      tokens: number;
      chunk_index: number;
      metadata: unknown;
      created_at: Date;
    };

    const result = await this.db.execute<ParentChunkRow[]>(
      sql`SELECT id, file_id, content, tokens, chunk_index, metadata, created_at FROM parent_chunks WHERE file_id = ${fileId} ORDER BY chunk_index LIMIT ${sql.raw(String(limit))} OFFSET ${sql.raw(String(offset))}`,
    );

    const rows = (result[0] as unknown as ParentChunkRow[]) || [];

    // Map snake_case to camelCase for consistency
    const mappedChunks = rows.map((row: ParentChunkRow) => ({
      id: row.id,
      fileId: row.file_id,
      content: row.content,
      tokens: row.tokens,
      chunkIndex: row.chunk_index,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));

    this.logger.log(
      `Retrieved ${mappedChunks.length} parent chunks for file ${fileId} (page ${page}/${Math.ceil(total / limit)})`,
    );

    return {
      chunks: mappedChunks,
      total,
      page,
      limit,
    };
  }

  async getChildChunksByFileId(
    fileId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    chunks: Array<{
      id: string;
      fileId: string;
      parentChunkId: string;
      content: string;
      tokens: number;
      chunkIndex: number;
      metadata: unknown;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;

    // Get total count
    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(childChunks)
      .where(eq(childChunks.fileId, fileId));

    const total = countResult?.count ?? 0;

    // Get chunks with pagination
    // Build query using SQL template with proper parameterization
    // db.execute() returns [rows, fields] tuple for mysql2
    // JOIN with parent_chunks to get parent chunk index
    type ChildChunkRow = {
      id: string;
      file_id: string;
      parent_chunk_id: string;
      parent_chunk_index: number;
      content: string;
      tokens: number;
      chunk_index: number;
      metadata: unknown;
      created_at: Date;
    };

    const result = await this.db.execute<ChildChunkRow[]>(
      sql`SELECT c.id, c.file_id, c.parent_chunk_id, p.chunk_index as parent_chunk_index, c.content, c.tokens, c.chunk_index, c.metadata, c.created_at FROM child_chunks c LEFT JOIN parent_chunks p ON c.parent_chunk_id = p.id WHERE c.file_id = ${fileId} ORDER BY c.chunk_index LIMIT ${sql.raw(String(limit))} OFFSET ${sql.raw(String(offset))}`,
    );

    const rows = (result[0] as unknown as ChildChunkRow[]) || [];

    // Map snake_case to camelCase for consistency
    const mappedChunks = rows.map((row: ChildChunkRow) => ({
      id: row.id,
      fileId: row.file_id,
      parentChunkId: row.parent_chunk_id,
      parentChunkIndex: row.parent_chunk_index,
      content: row.content,
      tokens: row.tokens,
      chunkIndex: row.chunk_index,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));

    this.logger.log(
      `Retrieved ${mappedChunks.length} child chunks for file ${fileId} (page ${page}/${Math.ceil(total / limit)})`,
    );

    return {
      chunks: mappedChunks,
      total,
      page,
      limit,
    };
  }

  async getChildChunksByParentId(
    parentChunkId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    chunks: Array<{
      id: string;
      fileId: string;
      parentChunkId: string;
      content: string;
      tokens: number;
      chunkIndex: number;
      metadata: unknown;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (page - 1) * limit;

    // Get total count
    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(childChunks)
      .where(eq(childChunks.parentChunkId, parentChunkId));

    const total = countResult?.count ?? 0;

    // Get chunks with pagination
    // Build query using SQL template with proper parameterization
    // db.execute() returns [rows, fields] tuple for mysql2
    // JOIN with parent_chunks to get parent chunk index
    type ChildChunkByParentRow = {
      id: string;
      file_id: string;
      parent_chunk_id: string;
      parent_chunk_index: number;
      content: string;
      tokens: number;
      chunk_index: number;
      metadata: unknown;
      created_at: Date;
    };

    const result = await this.db.execute<ChildChunkByParentRow[]>(
      sql`SELECT c.id, c.file_id, c.parent_chunk_id, p.chunk_index as parent_chunk_index, c.content, c.tokens, c.chunk_index, c.metadata, c.created_at FROM child_chunks c LEFT JOIN parent_chunks p ON c.parent_chunk_id = p.id WHERE c.parent_chunk_id = ${parentChunkId} ORDER BY c.chunk_index LIMIT ${sql.raw(String(limit))} OFFSET ${sql.raw(String(offset))}`,
    );

    const rows = (result[0] as unknown as ChildChunkByParentRow[]) || [];

    // Map snake_case to camelCase for consistency
    const mappedChunks = rows.map((row: ChildChunkByParentRow) => ({
      id: row.id,
      fileId: row.file_id,
      parentChunkId: row.parent_chunk_id,
      parentChunkIndex: row.parent_chunk_index,
      content: row.content,
      tokens: row.tokens,
      chunkIndex: row.chunk_index,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));

    this.logger.log(
      `Retrieved ${mappedChunks.length} child chunks for parent ${parentChunkId} (page ${page}/${Math.ceil(total / limit)})`,
    );

    return {
      chunks: mappedChunks,
      total,
      page,
      limit,
    };
  }

  async getFileIndexingDetails(fileId: string): Promise<{
    fileId: string;
    status: string | null;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    attempts: number;
    parentChunksCount: number;
    childChunksCount: number;
  }> {
    // Get job status
    const [job] = await this.db
      .select({
        fileId: indexingJobs.fileId,
        status: indexingJobs.status,
        error: indexingJobs.error,
        startedAt: indexingJobs.startedAt,
        completedAt: indexingJobs.completedAt,
        attempts: indexingJobs.attempts,
      })
      .from(indexingJobs)
      .where(eq(indexingJobs.fileId, fileId))
      .orderBy(desc(indexingJobs.createdAt))
      .limit(1);

    // Get chunk counts
    const [parentCount] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(parentChunks)
      .where(eq(parentChunks.fileId, fileId));

    const [childCount] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(childChunks)
      .where(eq(childChunks.fileId, fileId));

    this.logger.log(`Retrieved indexing details for file ${fileId}`);

    return {
      fileId,
      status: job?.status ?? null,
      error: job?.error ?? null,
      startedAt: job?.startedAt ?? null,
      completedAt: job?.completedAt ?? null,
      attempts: job?.attempts ?? 0,
      parentChunksCount: parentCount?.count ?? 0,
      childChunksCount: childCount?.count ?? 0,
    };
  }

  async deleteIndexedFile(fileId: string): Promise<void> {
    this.logger.log(
      `Received request to delete indexed data for file ${fileId}`,
    );

    const [job] = await this.db
      .select({
        documentId: indexingJobs.documentId,
      })
      .from(indexingJobs)
      .where(eq(indexingJobs.fileId, fileId))
      .orderBy(desc(indexingJobs.createdAt))
      .limit(1);

    const documentId = job?.documentId ?? null;

    const errors: string[] = [];

    try {
      await this.mysqlPersistenceService.cleanup(fileId);
      this.logger.log(`MySQL cleanup completed for file ${fileId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`MySQL cleanup failed: ${message}`);
      this.logger.error(`MySQL cleanup failed for file ${fileId}`, message);
    }

    if (!documentId) {
      this.logger.warn(
        `No indexing job found for file ${fileId}; skipping document-scoped cleanup.`,
      );
    }
    try {
      await this.qdrantPersistenceService.cleanup(fileId);
      this.logger.log(`Qdrant cleanup completed for file ${fileId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Qdrant cleanup failed: ${message}`);
      this.logger.error(`Qdrant cleanup failed for file ${fileId}`, message);
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
  }
}
