/**
 * Retrieval Workflow State Definition
 * Based on PRD Section "StateGraph Definition" (Lines 272-323)
 * Pattern: ltv-assistant-indexing/src/indexing/workflow/indexing-state.ts
 */

import { Annotation } from '@langchain/langgraph';
import type {
  AccessFilter,
  QdrantResult,
  DocumentMetadata,
  FusedResult,
  RerankedResult,
  EnrichedContext,
  Context,
} from '../../types';

/**
 * User Context (from Authentication)
 */
export interface UserContext {
  userId: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
}

/**
 * Query Request Input
 */
export interface QueryRequest {
  query: string;
  mode?: 'retrieval_only' | 'generation';
  topK?: number;
  useCache?: boolean; // Phase 1.5: Enable/disable semantic cache
}

/**
 * Workflow Metrics
 */
export interface WorkflowMetrics {
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  analysisDuration?: number;
  accessFilterDuration?: number;
  retrievalDuration?: number;
  fusionDuration?: number;
  rerankingDuration?: number;
  enrichmentDuration?: number;
  cacheHit?: boolean;
  cacheUpdateLatency?: number; // Phase 1.5: Cache storage latency
  qdrantResultCount?: number;
  hydeResultCount?: number; // HyDE embedding search result count
  reformulationResultCount?: number; // Reformulated queries result count
  rewriteResultCount?: number; // Rewritten query result count
  mysqlResultCount?: number;
  fusedResultCount?: number;
  deduplicatedCount?: number;
  whitelistDocCount?: number;
  rerankedResultCount?: number;
  parentChunkCount?: number;
  rerankFallbackTriggered?: boolean; // True if rerank fallback was triggered
  transformationMetrics?: {
    reformulatedCount: number;
    decomposedCount: number;
    rewriteApplied: boolean;
    hydeApplied: boolean;
  };
  subQueryMetrics?: {
    subQueriesExecuted: number;
    subQueryResultCount: number;
    subQueryDuration: number;
    aggregatedResultCount: number;
    decompositionReason: 'insufficient' | 'complex_query' | 'none';
  };
}

/**
 * Retrieval State Graph Definition
 * Following LangGraph.js Annotation.Root pattern
 */
export const RetrievalState = Annotation.Root({
  // ============================================
  // Input - Initial state from request
  // ============================================
  query: Annotation<string>,
  mode: Annotation<'retrieval_only' | 'generation'>,
  topK: Annotation<number>,

  // User context (from authentication)
  userId: Annotation<string>,
  userRole: Annotation<'SUPER_ADMIN' | 'ADMIN' | 'USER'>,
  userEmail: Annotation<string>,

  // ============================================
  // Cache control (Phase 1.5)
  // ============================================
  useCache: Annotation<boolean>, // Enable/disable semantic cache (from CMS request)
  cacheHit: Annotation<boolean>, // True if cache hit occurred
  cacheLatency: Annotation<number | null>, // Cache lookup/hit latency (ms)

  // ============================================
  // Pre-retrieval stage (Query Analysis & Transformation)
  // ============================================
  queryEmbedding: Annotation<number[] | null>,
  hydeEmbedding: Annotation<number[] | null>,
  reformulatedQueries: Annotation<string[]>,
  rewrittenQuery: Annotation<string | null>,
  hypotheticalDoc: Annotation<string | null>,
  decomposedQueries: Annotation<string[]>,
  accessFilter: Annotation<AccessFilter | null>,
  whitelistDocIds: Annotation<string[]>,

  // ============================================
  // Retrieval stage (Multi-Source Retrieval)
  // ============================================
  qdrantResults: Annotation<QdrantResult[]>,
  hydeResults: Annotation<QdrantResult[]>, // Results from HyDE embedding search
  reformulationResults: Annotation<QdrantResult[]>, // Results from reformulated query variations
  rewriteResults: Annotation<QdrantResult[]>, // Results from rewritten query
  mysqlResults: Annotation<DocumentMetadata[]>,
  fusedResults: Annotation<FusedResult[]>,
  subQueryResults: Annotation<QdrantResult[]>, // Results from sub-query execution
  decompositionTriggered: Annotation<boolean>, // Flag to track if decomposition was used

  // ============================================
  // Post-retrieval stage (Reranking & Enrichment)
  // ============================================
  rerankedResults: Annotation<RerankedResult[]>,
  enrichedContexts: Annotation<EnrichedContext[]>,

  // ============================================
  // Adaptive loop control
  // ============================================
  iterations: Annotation<number>,
  sufficiencyScore: Annotation<number>,
  shouldRetry: Annotation<boolean>,

  // ============================================
  // Output
  // ============================================
  finalContexts: Annotation<Context[]>,

  // ============================================
  // Workflow metadata
  // ============================================
  currentStage: Annotation<string>,
  errors: Annotation<string[]>,
  metrics: Annotation<WorkflowMetrics>,
  cachedResult: Annotation<boolean>,
});

/**
 * Type for the state object
 */
export type RetrievalStateType = typeof RetrievalState.State;

/**
 * Initial state factory
 * Creates the initial state for the retrieval workflow
 */
export function createInitialState(
  request: QueryRequest,
  userContext: UserContext,
): RetrievalStateType {
  return {
    // Input
    query: request.query,
    mode: request.mode || 'retrieval_only',
    topK: request.topK || 10,

    // User context
    userId: userContext.userId,
    userRole: userContext.role,
    userEmail: userContext.email,

    // Cache control (Phase 1.5)
    useCache: request.useCache !== false, // Default: true (cache enabled)
    cacheHit: false,
    cacheLatency: null,

    // Pre-retrieval stage (initialized)
    queryEmbedding: null,
    hydeEmbedding: null,
    reformulatedQueries: [],
    rewrittenQuery: null,
    hypotheticalDoc: null,
    decomposedQueries: [],
    accessFilter: null,
    whitelistDocIds: [],

    // Retrieval stage (initialized)
    qdrantResults: [],
    hydeResults: [],
    reformulationResults: [],
    rewriteResults: [],
    mysqlResults: [],
    fusedResults: [],
    subQueryResults: [],
    decompositionTriggered: false,

    // Post-retrieval stage (initialized)
    rerankedResults: [],
    enrichedContexts: [],

    // Adaptive loop control
    iterations: 0,
    sufficiencyScore: 0,
    shouldRetry: false,

    // Output
    finalContexts: [],

    // Workflow metadata
    currentStage: 'init',
    errors: [],
    metrics: {
      startTime: Date.now(),
    },
    cachedResult: false,
  };
}
