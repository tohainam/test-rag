/**
 * Indexing Workflow State Definition
 * Based on specs from docs/plans/indexing-prd.md - Section: Luồng công việc LangGraph.js
 */

import { Annotation } from '@langchain/langgraph';
import { Document } from '@langchain/core/documents';
import type { StructuredDocument } from '../stages/structure/types';
import type {
  ChildChunkWithEmbedding,
  SummaryWithEmbedding,
  HypotheticalQuestionWithEmbedding,
} from '../stages/embed/types';
import type {
  EnrichedParentChunk,
  EnrichedChildChunk,
} from '../stages/enrich/types/enrich.types';

/**
 * Load Stage State
 */
export interface LoadMetadata {
  fileId: string;
  filename: string;
  size: number;
  mimeType: string | null;
  checksumMd5?: string;
  retrievedAt: Date;
  loadMethod: 'buffer' | 'stream';
}

/**
 * Chunk Stage State
 */
export interface ParentChunk {
  id: string;
  documentId: string;
  fileId: string;
  content: string;
  tokens: number;
  chunkIndex: number;
  metadata: Record<string, unknown>;
}

export interface ChildChunk {
  id: string;
  parentChunkId: string;
  documentId: string;
  fileId: string;
  content: string;
  tokens: number;
  chunkIndex: number;
  metadata: Record<string, unknown>;
}

export interface ChunkLineage {
  id: string;
  childChunkId: string;
  parentChunkId: string;
  documentId: string;
}

/**
 * Enrich Stage State
 * (EnrichedParentChunk and EnrichedChildChunk are imported from enrich stage types)
 */

/**
 * Embed Stage State (Multi-Vector)
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
 * Persist Stage State
 */
export interface PersistResult {
  mysqlSuccess: boolean;
  qdrantSuccess: boolean;
  timestamp: Date;
}

/**
 * Structure Stage State
 * (StructuredDocument type imported from structure stage types)
 */

/**
 * Workflow Metrics
 */
export interface WorkflowMetrics {
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  stagesCompleted?: string[];
  parentChunksCreated?: number;
  childChunksCreated?: number;
  embeddingsGenerated?: number;
}

/**
 * Indexing State Graph Definition
 * Following LangGraph.js Annotation pattern from PRD
 */
export const IndexingState = Annotation.Root({
  // Input - Initial state from job
  fileId: Annotation<string>,
  documentId: Annotation<string>,
  filePath: Annotation<string>,
  filename: Annotation<string>,
  mimeType: Annotation<string | null>,

  // Load stage output
  buffer: Annotation<Buffer | null>,
  streamPath: Annotation<string | null>,
  loadMetadata: Annotation<LoadMetadata | null>,

  // Parse stage output
  parsedDocs: Annotation<Document[]>,

  // Structure stage output
  structuredDoc: Annotation<StructuredDocument | null>,

  // Chunk stage output
  parentChunks: Annotation<ParentChunk[]>,
  childChunks: Annotation<ChildChunk[]>,
  lineage: Annotation<ChunkLineage[]>,

  // Enrich stage output
  enrichedParents: Annotation<EnrichedParentChunk[]>,
  enrichedChildren: Annotation<EnrichedChildChunk[]>,

  // Embed stage output (Multi-Vector)
  embeddedChildren: Annotation<ChildChunkWithEmbedding[]>,
  embeddedSummaries: Annotation<SummaryWithEmbedding[] | undefined>,
  embeddedQuestions: Annotation<
    HypotheticalQuestionWithEmbedding[] | undefined
  >,
  embeddingMetadata: Annotation<EmbeddingMetadata | null>,

  // Persist stage output
  persistResult: Annotation<PersistResult | null>,

  // Workflow metadata
  currentStage: Annotation<string>,
  errors: Annotation<string[]>,
  metrics: Annotation<WorkflowMetrics>,
});

/**
 * Type for the state object
 */
export type IndexingStateType = typeof IndexingState.State;

/**
 * Initial state factory
 */
export function createInitialState(input: {
  fileId: string;
  documentId: string;
  filePath: string;
  filename: string;
  mimeType: string | null;
}): IndexingStateType {
  return {
    // Input
    fileId: input.fileId,
    documentId: input.documentId,
    filePath: input.filePath,
    filename: input.filename,
    mimeType: input.mimeType,

    // Load stage
    buffer: null,
    streamPath: null,
    loadMetadata: null,

    // Parse stage
    parsedDocs: [],

    // Structure stage
    structuredDoc: null,

    // Chunk stage
    parentChunks: [],
    childChunks: [],
    lineage: [],

    // Enrich stage
    enrichedParents: [],
    enrichedChildren: [],

    // Embed stage (Multi-Vector)
    embeddedChildren: [],
    embeddedSummaries: undefined,
    embeddedQuestions: undefined,
    embeddingMetadata: null,

    // Persist stage
    persistResult: null,

    // Workflow metadata
    currentStage: 'init',
    errors: [],
    metrics: {
      startTime: new Date(),
      stagesCompleted: [],
    },
  };
}
