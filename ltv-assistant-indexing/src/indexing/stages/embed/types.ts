/**
 * Embed Stage Types
 * Multi-Vector Retrieval with Hybrid Search (Dense + Sparse)
 */

import type {
  EnrichedParentChunk,
  EnrichedChildChunk,
} from '../enrich/types/enrich.types';

/**
 * Sparse Vector Representation (BM25)
 */
export interface SparseVector {
  indices: number[];
  values: number[];
}

/**
 * Child Chunk with Dense + Sparse Embeddings
 */
export interface ChildChunkWithEmbedding extends EnrichedChildChunk {
  denseEmbedding: number[];
  sparseEmbedding: SparseVector;
}

/**
 * Summary with Dense + Sparse Embeddings
 */
export interface SummaryWithEmbedding {
  id: string;
  parentChunkId: string;
  documentId: string;
  summary: string;
  denseEmbedding: number[];
  sparseEmbedding: SparseVector;
}

/**
 * Hypothetical Question with Dense + Sparse Embeddings
 */
export interface HypotheticalQuestionWithEmbedding {
  id: string;
  parentChunkId: string;
  documentId: string;
  question: string;
  denseEmbedding: number[];
  sparseEmbedding: SparseVector;
}

/**
 * Embedding Metadata
 */
export interface EmbeddingMetadata {
  provider: string;
  model: string;
  dimensions: number;
  sparseMethod: string;
  totalChildren: number;
  embeddedChildrenCount: number;
  embeddedSummariesCount: number;
  embeddedQuestionsCount: number;
  failedCount: number;
  successRate: number;
  durationMs: number;
}

/**
 * Input DTO for Embed Stage
 */
export interface EmbedInputDto {
  enrichedParents: EnrichedParentChunk[];
  enrichedChildren: EnrichedChildChunk[];
  documentId: string;
  metadata?: {
    totalParents: number;
    totalChildren: number;
  };
}

/**
 * Output DTO for Embed Stage
 */
export interface EmbedOutputDto {
  embeddedChildren: ChildChunkWithEmbedding[];
  embeddedSummaries?: SummaryWithEmbedding[];
  embeddedQuestions?: HypotheticalQuestionWithEmbedding[];
  embeddingMetadata: EmbeddingMetadata;
  errors: string[];
}

/**
 * Embedding Provider Configuration
 */
export interface EmbeddingProviderConfig {
  provider: 'ollama' | 'openai' | 'google';
  model: string;
  dimensions: number;
  baseURL?: string;
  apiKey?: string;
}

/**
 * Batch Processing Result
 */
export interface BatchResult {
  successful: Array<{ id: string; embedding: number[] }>;
  failed: Array<{ id: string; error: string }>;
  durationMs: number;
}
