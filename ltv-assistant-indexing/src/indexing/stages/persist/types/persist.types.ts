/**
 * Persist Stage Types
 * Based on specs from docs/plans/persist-stage.md
 */

/**
 * MySQL Persistence Result
 */
export interface MySQLPersistenceResult {
  success: boolean;
  documentsInserted: number;
  parentChunksInserted: number;
  childChunksInserted: number;
  lineageInserted: number;
  durationMs: number;
  error?: string;
}

/**
 * Qdrant Persistence Result (Multi-Vector)
 */
export interface QdrantPersistenceResult {
  success: boolean;
  childrenVectorsInserted: number;
  summariesVectorsInserted: number;
  questionsVectorsInserted: number;
  durationMs: number;
  error?: string;
}

/**
 * Rollback Context - Tracks what was successfully persisted
 */
export interface RollbackContext {
  documentId: string;
  fileId: string;
  mysqlSuccess: boolean;
  qdrantSuccess: boolean;
  qdrantVectorsInserted: {
    childrenCount: number;
    summariesCount: number;
    questionsCount: number;
  };
}

/**
 * Parent Chunk Metadata (for MySQL only - no embeddings)
 */
export interface ParentChunkMetadata {
  id: string;
  documentId: string;
  fileId: string;
  content: string;
  tokens: number;
  chunkIndex: number;
  metadata: Record<string, unknown>;
}

/**
 * Chunk Lineage for parent-child mapping
 */
export interface ChunkLineage {
  id: string;
  parentChunkId: string;
  childChunkId: string;
  documentId: string;
  childOrder: number;
}
