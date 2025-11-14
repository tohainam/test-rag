/**
 * Retrieval Service Types
 * Strong typing for all retrieval operations
 */

// Re-export database types
export type { ParentChunk, ChildChunk } from '../../database/schema';

/**
 * Qdrant Search Result
 */
export interface QdrantResult {
  chunkId: string;
  parentChunkId: string;
  documentId: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Document Metadata from Datasource Service (via TCP)
 */
export interface DocumentMetadata {
  documentId: string;
  title: string;
  description?: string;
  type: string;
  fileType?: string;
  chunkIds: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Fused Result after RRF Algorithm
 */
export interface FusedResult {
  chunkId: string;
  parentChunkId: string;
  documentId: string;
  content: string;
  rrfScore: number;
  sources: string[];
  originalScores: Record<string, number>;
  documentMetadata?: {
    title: string;
    description?: string;
    type: string;
    fileType?: string;
  };
}

/**
 * Reranked Result after Cross-Encoder
 */
export interface RerankedResult {
  chunkId: string;
  parentChunkId: string;
  documentId: string;
  content: string;
  rerankScore: number;
  rrfScore: number;
}

/**
 * Enriched Context with Parent Chunk
 */
export interface EnrichedContext {
  parentChunkId: string;
  documentId: string;
  content: string;
  tokens: number;
  metadata: {
    sectionPath?: string[];
    pageNumber?: number;
    documentTitle?: string;
    documentType?: string;
  };
  childChunks: Array<{
    chunkId: string;
    content: string;
    rerankScore: number;
  }>;
  bestScore: number;
}

/**
 * Final Context Output
 */
export interface Context {
  parentChunkId: string;
  documentId: string;
  content: string;
  tokens: number;
  score: number;
  metadata: Record<string, unknown>;
  sources: {
    childChunks: Array<{
      chunkId: string;
      content: string;
      score: number;
    }>;
  };
}

/**
 * Access Filter for RBAC
 */
export interface AccessFilter {
  role: string;
  publicAccess: boolean;
  whitelistDocIds: string[];
  createdByUserId?: string;
  qdrantFilter: QdrantFilter;
}

/**
 * Qdrant Filter Structure
 */
export interface QdrantFilter {
  should?: Array<{
    key: string;
    match: { value: string | string[] };
  }>;
  must?: Array<{
    key: string;
    match: { value: string | string[] };
  }>;
}

/**
 * User Context from Authentication
 */
export interface UserContext {
  userId: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
}

/**
 * Query Request DTO
 */
export interface QueryRequest {
  query: string;
  mode?: 'retrieval_only' | 'generation';
  topK?: number;
}

/**
 * Retrieval Result
 */
export interface RetrievalResult {
  contexts: Context[];
  metrics: {
    totalDuration: number;
    cacheHit: boolean;
    qdrantResultCount: number;
    rerankedResultCount: number;
    parentChunkCount: number;
    iterations: number;
    sufficiencyScore: number;
  };
  cached: boolean;
}
