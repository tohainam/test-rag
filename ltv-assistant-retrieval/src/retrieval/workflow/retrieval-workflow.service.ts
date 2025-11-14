/**
 * Retrieval Workflow Service
 * Based on PRD Section "Xây dựng Graph" + Indexing service pattern
 * Pattern: ltv-assistant-indexing/src/indexing/workflow/indexing-workflow.service.ts
 *
 * This service creates and manages the LangGraph.js StateGraph for the
 * retrieval pipeline with adaptive loop and multi-source retrieval.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StateGraph, START, END } from '@langchain/langgraph';
import {
  RetrievalState,
  type RetrievalStateType,
  createInitialState,
  type QueryRequest,
  type UserContext,
} from './state/retrieval-state';
import { createCheckCacheNode } from './nodes/check-cache.node';
import { createAnalyzeQueryNode } from './nodes/analyze-query.node';
import { createBuildAccessFilterNode } from './nodes/build-access-filter.node';
import { createHybridRetrievalNode } from './nodes/hybrid-retrieval.node';
import { createExecuteSubQueriesNode } from './nodes/execute-sub-queries.node';
import { createFusionNode } from './nodes/fusion.node';
import { createRerankNode } from './nodes/rerank.node';
import { createEnrichNode } from './nodes/enrich-small-to-big.node';
import { createCheckSufficiencyNode } from './nodes/check-sufficiency.node';
import { createSelectModeNode } from './nodes/select-mode.node';
import { createUpdateCacheNode } from './nodes/update-cache.node';
import { EmbeddingProviderFactory } from '../providers/embedding-provider.factory';
import { LLMProviderFactory } from '../providers/llm-provider.factory';
import { QueryTransformationService } from '../services/query-transformation.service';
import { QdrantService } from '../services/qdrant.service';
import { QdrantCacheService } from '../services/qdrant-cache.service';
import { MySQLService } from '../services/mysql.service';
import { RerankerService } from '../services/reranker.service';
import { DatasourceClient } from '../clients/datasource.client';
import type { Context } from '../types';

/**
 * Retrieval Result Output
 */
export interface RetrievalResult {
  contexts: Context[];
  metrics: {
    totalDuration: number;
    cacheHit: boolean;
    qdrantResultCount: number;
    hydeResultCount: number;
    reformulationResultCount: number;
    rewriteResultCount: number;
    rerankedResultCount: number;
    parentChunkCount: number;
    iterations: number;
    sufficiencyScore: number;
  };
  cached: boolean;
}

/**
 * Type guard to validate workflow result matches expected state type
 */
function isRetrievalStateType(value: unknown): value is RetrievalStateType {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const state = value as Record<string, unknown>;

  return (
    typeof state.query === 'string' &&
    typeof state.mode === 'string' &&
    typeof state.topK === 'number' &&
    typeof state.userId === 'string' &&
    typeof state.userRole === 'string' &&
    typeof state.currentStage === 'string' &&
    Array.isArray(state.errors) &&
    typeof state.metrics === 'object' &&
    state.metrics !== null &&
    Array.isArray(state.finalContexts)
  );
}

@Injectable()
export class RetrievalWorkflowService {
  private readonly logger = new Logger(RetrievalWorkflowService.name);
  private workflow: ReturnType<typeof StateGraph.prototype.compile> | null =
    null;

  constructor(
    private readonly configService: ConfigService,
    private readonly embeddingFactory: EmbeddingProviderFactory,
    private readonly llmFactory: LLMProviderFactory,
    private readonly queryTransformationService: QueryTransformationService,
    private readonly qdrantService: QdrantService,
    private readonly qdrantCacheService: QdrantCacheService,
    private readonly mysqlService: MySQLService,
    private readonly rerankerService: RerankerService,
    private readonly datasourceClient: DatasourceClient,
  ) {
    this.initializeWorkflow();
  }

  /**
   * Initialize the LangGraph workflow
   * Based on PRD Section: Xây dựng Graph
   *
   * Phase 1.5: checkCache, updateCache nodes (semantic cache)
   * Phase 4: analyzeQuery node (query transformation)
   * Phase 5: buildAccessFilter, hybridRetrieval, fusion nodes
   * Phase 6: rerank, enrich, checkSufficiency, selectMode + adaptive loop
   */
  private initializeWorkflow(): void {
    this.logger.log('Initializing LangGraph retrieval workflow...');

    try {
      // Create StateGraph with RetrievalState
      // Pattern from indexing service: Use START/END with addEdge()
      const graph = new StateGraph(RetrievalState)
        // Phase 1.5: Semantic cache check
        .addNode(
          'checkCache',
          createCheckCacheNode(this.qdrantCacheService, this.embeddingFactory),
        )
        // Phase 4: Query analysis and transformation
        .addNode(
          'analyzeQuery',
          createAnalyzeQueryNode(
            this.embeddingFactory,
            this.queryTransformationService,
          ),
        )
        // Phase 5: Access control filter
        .addNode(
          'buildAccessFilter',
          createBuildAccessFilterNode(this.datasourceClient),
        )
        // Phase 5: Multi-source retrieval
        .addNode(
          'hybridRetrieval',
          createHybridRetrievalNode(
            this.qdrantService,
            this.mysqlService,
            this.datasourceClient,
            this.embeddingFactory,
          ),
        )
        // Phase 5B: Execute sub-queries (query decomposition execution)
        .addNode(
          'executeSubQueries',
          createExecuteSubQueriesNode(
            this.embeddingFactory,
            this.qdrantService,
          ),
        )
        // Phase 5: Result fusion with RRF
        .addNode('fusion', createFusionNode())
        // Phase 6: Cross-encoder reranking
        .addNode(
          'rerank',
          createRerankNode(this.rerankerService, this.configService),
        )
        // Phase 6: Small-to-Big enrichment
        .addNode('enrich', createEnrichNode(this.mysqlService))
        // Phase 6: Sufficiency assessment
        .addNode(
          'checkSufficiency',
          createCheckSufficiencyNode(this.configService),
        )
        // Phase 6: Mode selection and final output
        .addNode('selectMode', createSelectModeNode())
        // Phase 1.5: Update semantic cache
        .addNode(
          'updateCache',
          createUpdateCacheNode(this.qdrantCacheService, this.datasourceClient),
        )
        // Define workflow edges - START with cache check
        .addEdge(START, 'checkCache')
        // Conditional edge: cache hit or miss
        .addConditionalEdges(
          'checkCache',
          (state: RetrievalStateType) => {
            return state.cacheHit ? 'cache_hit' : 'cache_miss';
          },
          {
            cache_hit: END, // Cache HIT: skip retrieval, return cached contexts
            cache_miss: 'analyzeQuery', // Cache MISS: continue to full retrieval
          },
        )
        .addEdge('analyzeQuery', 'buildAccessFilter')
        .addEdge('buildAccessFilter', 'hybridRetrieval')
        .addEdge('hybridRetrieval', 'fusion')
        .addEdge('fusion', 'rerank')
        .addEdge('rerank', 'enrich')
        .addEdge('enrich', 'checkSufficiency')
        // Conditional edge: retry if insufficient, trigger decomposition, or continue
        .addConditionalEdges(
          'checkSufficiency',
          (state: RetrievalStateType) => {
            // Priority order:
            // 1. If decomposition triggered (insufficient + max retries + has decomposed queries) → execute sub-queries
            // 2. If should retry (insufficient + has retries left) → retry from analyzeQuery
            // 3. Otherwise → continue to selectMode
            if (
              state.decompositionTriggered &&
              state.decomposedQueries &&
              state.decomposedQueries.length > 0 &&
              (!state.subQueryResults || state.subQueryResults.length === 0)
            ) {
              return 'decomposition';
            }
            return state.shouldRetry ? 'retry' : 'continue';
          },
          {
            decomposition: 'executeSubQueries', // Execute sub-queries for insufficient results
            retry: 'analyzeQuery', // Loop back to query analysis
            continue: 'selectMode', // Proceed to final output
          },
        )
        // After executeSubQueries, go back to fusion to merge with main results
        .addEdge('executeSubQueries', 'fusion')
        // Phase 1.5: Update cache after mode selection
        .addEdge('selectMode', 'updateCache')
        .addEdge('updateCache', END);

      // Compile the workflow (no checkpointer - stateless workflow for Phase 1)
      this.workflow = graph.compile();

      this.logger.log(
        '✓ LangGraph retrieval workflow initialized successfully',
      );
      this.logger.log(
        '✓ Phase 1.5: checkCache, updateCache nodes (semantic cache)',
      );
      this.logger.log('✓ Phase 4: analyzeQuery node (query transformation)');
      this.logger.log(
        '✓ Phase 5: buildAccessFilter, hybridRetrieval, executeSubQueries, fusion nodes',
      );
      this.logger.log(
        '✓ Phase 6: rerank, enrich, checkSufficiency, selectMode nodes + adaptive loop',
      );
      this.logger.log(
        '✓ Query Decomposition Execution: Hybrid fallback approach enabled',
      );
    } catch (error) {
      this.logger.error(
        'Failed to initialize LangGraph workflow',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Execute the retrieval workflow
   * Based on PRD Section: Thực thi Workflow
   *
   * @param request - Query request from user
   * @param userContext - User context from authentication
   * @returns Retrieval execution result
   */
  async executeWorkflow(
    request: QueryRequest,
    userContext: UserContext,
  ): Promise<RetrievalResult> {
    const startTime = Date.now();

    this.logger.log(
      `Starting retrieval workflow for query: "${request.query}" (mode: ${request.mode || 'retrieval_only'}, topK: ${request.topK || 10})`,
    );

    try {
      // Create initial state
      const initialState = createInitialState(request, userContext);

      // Execute workflow
      if (!this.workflow) {
        throw new Error('Workflow not initialized');
      }

      const result = await this.workflow.invoke(initialState);

      // Validate result type
      if (!isRetrievalStateType(result)) {
        throw new Error('Invalid workflow result - type guard failed');
      }

      // Format and return result
      const formattedResult = this.formatResult(result, startTime);

      this.logger.log(
        `Retrieval workflow completed: ${formattedResult.contexts.length} contexts, ${formattedResult.metrics.totalDuration}ms`,
      );

      return formattedResult;
    } catch (error) {
      this.logger.error(
        'Retrieval workflow execution failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Format workflow result into API response
   */
  private formatResult(
    state: RetrievalStateType,
    startTime: number,
  ): RetrievalResult {
    const endTime = Date.now();
    const totalDuration = endTime - startTime;

    return {
      contexts: state.finalContexts,
      metrics: {
        totalDuration,
        cacheHit: state.cachedResult,
        qdrantResultCount: state.qdrantResults.length,
        hydeResultCount: state.hydeResults.length,
        reformulationResultCount: state.reformulationResults.length,
        rewriteResultCount: state.rewriteResults.length,
        rerankedResultCount: state.rerankedResults.length,
        parentChunkCount: state.enrichedContexts.length,
        iterations: state.iterations,
        sufficiencyScore: state.sufficiencyScore,
      },
      cached: state.cachedResult,
    };
  }

  /**
   * Health check for workflow readiness
   */
  async healthCheck(): Promise<{
    workflowReady: boolean;
    services: Record<string, boolean>;
  }> {
    const services = {
      qdrant: await this.qdrantService.healthCheck(),
      cache: await this.qdrantCacheService.healthCheck(),
      mysql: await this.mysqlService.healthCheck(),
      reranker: await this.rerankerService.healthCheck(),
    };

    const workflowReady = this.workflow !== null;

    return {
      workflowReady,
      services,
    };
  }
}
