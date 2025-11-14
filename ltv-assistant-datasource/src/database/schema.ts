import {
  mysqlTable,
  varchar,
  text,
  bigint,
  datetime,
  int,
  mysqlEnum,
  index,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

// Documents table
export const documents = mysqlTable('documents', {
  id: varchar('id', { length: 36 }).primaryKey(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  type: mysqlEnum('type', ['public', 'restricted']).notNull().default('public'),
  createdBy: varchar('created_by', { length: 36 }).notNull(), // References users.id in ltv_auth_db (via TCP)
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

// Files table
export const files = mysqlTable('files', {
  id: varchar('id', { length: 36 }).primaryKey(),
  documentId: varchar('document_id', { length: 36 }).notNull(),
  filename: varchar('filename', { length: 500 }).notNull(),
  filePath: varchar('file_path', { length: 1000 }).notNull(), // MinIO path
  fileType: varchar('file_type', { length: 50 }).notNull(),
  fileSize: bigint('file_size', { mode: 'number' }).notNull(), // bytes
  mimeType: varchar('mime_type', { length: 100 }),
  uploadId: varchar('upload_id', { length: 255 }), // For multipart uploads
  status: mysqlEnum('status', ['pending', 'uploading', 'uploaded', 'failed'])
    .notNull()
    .default('pending'),
  uploadedAt: datetime('uploaded_at'),
  processedAt: datetime('processed_at'),
  chunkCount: int('chunk_count').default(0),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// Document whitelist table
export const documentWhitelist = mysqlTable('document_whitelist', {
  id: varchar('id', { length: 36 }).primaryKey(),
  documentId: varchar('document_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(), // References users.id in ltv_auth_db (via TCP)
  grantedBy: varchar('granted_by', { length: 36 }).notNull(), // References users.id in ltv_auth_db (via TCP)
  grantedAt: datetime('granted_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  expiresAt: datetime('expires_at'), // NULL = no expiration
});

// Outbox Events table for Outbox Pattern
export const outboxEvents = mysqlTable(
  'outbox_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    aggregateType: varchar('aggregate_type', { length: 50 })
      .notNull()
      .default('FILE'),
    aggregateId: varchar('aggregate_id', { length: 36 }).notNull(),
    eventType: varchar('event_type', { length: 100 })
      .notNull()
      .default('DOCUMENT_FILE_UPLOADED'),
    payloadJson: text('payload_json').notNull(),
    payloadSchemaVersion: int('payload_schema_version').notNull().default(1),
    payloadChecksum: varchar('payload_checksum', { length: 64 }).notNull(),
    status: mysqlEnum('status', [
      'pending',
      'publishing',
      'published',
      'failed',
      'poison',
    ])
      .notNull()
      .default('pending'),
    retryCount: int('retry_count').notNull().default(0),
    availableAt: datetime('available_at').notNull(),
    publishedAt: datetime('published_at'),
    errorLog: text('error_log'),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('idx_status_available').on(t.status, t.availableAt),
    index('idx_aggregate_id').on(t.aggregateId),
    index('idx_created_at').on(t.createdAt),
  ],
);

// Outbox Events Archive table for 90-day retention
export const outboxEventsArchive = mysqlTable(
  'outbox_events_archive',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    aggregateType: varchar('aggregate_type', { length: 50 }).notNull(),
    aggregateId: varchar('aggregate_id', { length: 36 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    payloadJson: text('payload_json').notNull(),
    payloadSchemaVersion: int('payload_schema_version').notNull(),
    payloadChecksum: varchar('payload_checksum', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    retryCount: int('retry_count').notNull(),
    availableAt: datetime('available_at').notNull(),
    publishedAt: datetime('published_at'),
    errorLog: text('error_log'),
    createdAt: datetime('created_at').notNull(),
    updatedAt: datetime('updated_at').notNull(),
    archivedAt: datetime('archived_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('idx_archived_at').on(t.archivedAt)],
);

// Export types
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type DocumentWhitelist = typeof documentWhitelist.$inferSelect;
export type NewDocumentWhitelist = typeof documentWhitelist.$inferInsert;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
export type OutboxEventArchive = typeof outboxEventsArchive.$inferSelect;
export type NewOutboxEventArchive = typeof outboxEventsArchive.$inferInsert;
