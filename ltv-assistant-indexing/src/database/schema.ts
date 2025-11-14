import {
  mysqlTable,
  varchar,
  timestamp,
  text,
  int,
  mysqlEnum,
  json,
  index,
} from 'drizzle-orm/mysql-core';

export const indexingJobs = mysqlTable('indexing_jobs', {
  id: varchar('id', { length: 36 }).primaryKey(),
  fileId: varchar('file_id', { length: 36 }).notNull(),
  documentId: varchar('document_id', { length: 36 }).notNull(),
  filename: varchar('filename', { length: 5000 }).notNull(),
  jobId: varchar('job_id', { length: 100 }),
  status: mysqlEnum('status', ['pending', 'processing', 'completed', 'failed'])
    .notNull()
    .default('pending'),
  attempts: int('attempts').notNull().default(0),
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export type IndexingJob = typeof indexingJobs.$inferSelect;
export type NewIndexingJob = typeof indexingJobs.$inferInsert;

// ============================================
// Persist Stage Tables
// ============================================

/**
 * Parent chunks table - Stores parent chunk metadata (~1800 tokens)
 * fileId references files table in ltv-assistant-datasource database
 * Based on specs from docs/plans/persist-stage.md - YN-1
 */
export const parentChunks = mysqlTable(
  'parent_chunks',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    fileId: varchar('file_id', { length: 255 }).notNull(),
    content: text('content').notNull(),
    tokens: int('tokens').notNull(),
    chunkIndex: int('chunk_index').notNull(),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('idx_file_id').on(table.fileId)],
);

export type ParentChunk = typeof parentChunks.$inferSelect;
export type NewParentChunk = typeof parentChunks.$inferInsert;

/**
 * Child chunks table - Stores child chunk metadata (~512 tokens)
 * fileId references files table in ltv-assistant-datasource database
 * Based on specs from docs/plans/persist-stage.md - YN-1
 */
export const childChunks = mysqlTable(
  'child_chunks',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    fileId: varchar('file_id', { length: 255 }).notNull(),
    parentChunkId: varchar('parent_chunk_id', { length: 255 })
      .notNull()
      .references(() => parentChunks.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    tokens: int('tokens').notNull(),
    chunkIndex: int('chunk_index').notNull(),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_file_id').on(table.fileId),
    index('idx_parent_chunk_id').on(table.parentChunkId),
  ],
);

export type ChildChunk = typeof childChunks.$inferSelect;
export type NewChildChunk = typeof childChunks.$inferInsert;

/**
 * Chunk lineage table - Explicit parent-child relationships
 * Based on specs from docs/plans/persist-stage.md - YN-1
 */
export const chunkLineage = mysqlTable(
  'chunk_lineage',
  {
    id: int('id').primaryKey().autoincrement(),
    parentChunkId: varchar('parent_chunk_id', { length: 255 })
      .notNull()
      .references(() => parentChunks.id, { onDelete: 'cascade' }),
    childChunkId: varchar('child_chunk_id', { length: 255 })
      .notNull()
      .references(() => childChunks.id, { onDelete: 'cascade' }),
    childOrder: int('child_order').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_parent_chunk_id').on(table.parentChunkId),
    index('idx_child_chunk_id').on(table.childChunkId),
  ],
);

export type ChunkLineage = typeof chunkLineage.$inferSelect;
export type NewChunkLineage = typeof chunkLineage.$inferInsert;
