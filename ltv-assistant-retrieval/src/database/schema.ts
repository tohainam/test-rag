// READ-ONLY Schema - Source of truth: ltv-assistant-indexing/src/database/schema.ts
// This service only reads data, never writes

import {
  mysqlTable,
  varchar,
  timestamp,
  text,
  int,
  json,
  index,
} from 'drizzle-orm/mysql-core';

// ============================================
// Chunk Tables (for Small-to-Big Retrieval)
// ============================================

/**
 * Parent chunks table - Stores parent chunk metadata (~1800 tokens)
 * fileId references files table in ltv-assistant-datasource database
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

/**
 * Child chunks table - Stores child chunk metadata (~512 tokens)
 * fileId references files table in ltv-assistant-datasource database
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
