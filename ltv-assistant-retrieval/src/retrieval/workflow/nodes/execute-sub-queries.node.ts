/**
 * Execute Sub-Queries Node
 * Executes decomposed sub-queries in parallel for complex queries
 * Triggered when main query is insufficient after retries
 * Reference: Query Decomposition Execution Implementation
 */

import { Logger } from '@nestjs/common';
import type { RetrievalState } from '../state/retrieval-state';
import type { EmbeddingProviderFactory } from '../../providers/embedding-provider.factory';
import type { QdrantService } from '../../services/qdrant.service';
import type { QdrantResult } from '../../types';

const logger = new Logger('ExecuteSubQueriesNode');

/**
 * Factory function to create executeSubQueries node
 * Pattern: Inject services, return node function
 */
export function createExecuteSubQueriesNode(
  embeddingFactory: EmbeddingProviderFactory,
  qdrantService: QdrantService,
) {
  /**
   * Node function: Execute decomposed queries in parallel
   * @param state - Current retrieval state
   * @returns Partial state update with sub-query results
   */
  return async (
    state: typeof RetrievalState.State,
  ): Promise<Partial<typeof RetrievalState.State>> => {
    const startTime = Date.now();

    // Skip if no decomposed queries
    if (!state.decomposedQueries || state.decomposedQueries.length === 0) {
      logger.log(
        `[ExecuteSubQueries] stage=5B_execute_sub_queries substage=skip status=no_queries`,
      );
      return {
        currentStage: 'execute_sub_queries_skipped',
        decompositionTriggered: true,
        subQueryResults: [],
      };
    }

    logger.log(
      `[ExecuteSubQueries] stage=5B_execute_sub_queries substage=start status=starting count=${state.decomposedQueries.length}`,
    );

    try {
      // ============================================
      // Step 1: Generate embeddings for all sub-queries in parallel
      // ============================================
      logger.log(
        `[ExecuteSubQueries] stage=5B_execute_sub_queries substage=embeddings status=generating`,
      );
      const embeddings = embeddingFactory.createEmbeddingModel();
      const subQueryEmbeddings = await Promise.all(
        state.decomposedQueries.map((sq) => embeddings.embedQuery(sq)),
      );

      logger.log(
        `[ExecuteSubQueries] stage=5B_execute_sub_queries substage=embeddings status=completed count=${subQueryEmbeddings.length}`,
      );

      // ============================================
      // Step 2: Calculate limit per sub-query
      // Distribute topK across sub-queries, minimum 3 per query
      // ============================================
      const limitPerSubQuery = Math.max(
        3,
        Math.floor(state.topK / state.decomposedQueries.length),
      );

      logger.log(
        `[ExecuteSubQueries] stage=5B_execute_sub_queries substage=search status=starting limit_per_query=${limitPerSubQuery}`,
      );

      // ============================================
      // Step 3: Execute hybrid search for each sub-query in parallel
      // Uses same QdrantService.search as main query
      // ============================================
      const subQueryResults = await Promise.all(
        subQueryEmbeddings.map((embedding, idx) =>
          qdrantService.search(
            embedding,
            state.accessFilter?.qdrantFilter,
            limitPerSubQuery,
            state.decomposedQueries[idx], // Pass query text for sparse search
          ),
        ),
      );

      // ============================================
      // Step 4: Flatten and deduplicate by chunkId
      // Keep highest score for each chunk
      // ============================================
      const allResults = subQueryResults.flat();
      const deduplicatedMap = new Map<string, QdrantResult>();

      allResults.forEach((result) => {
        const existing = deduplicatedMap.get(result.chunkId);
        if (!existing || result.score > existing.score) {
          deduplicatedMap.set(result.chunkId, result);
        }
      });

      const aggregatedResults = Array.from(deduplicatedMap.values());
      const duration = Date.now() - startTime;

      logger.log(
        `[ExecuteSubQueries] stage=5B_execute_sub_queries substage=complete status=success duration=${duration}ms total=${allResults.length} unique=${aggregatedResults.length}`,
      );

      // Log individual sub-query results for debugging
      subQueryResults.forEach((results, idx) => {
        logger.debug(
          `[ExecuteSubQueries] stage=5B_execute_sub_queries substage=search query_index=${idx + 1} results=${results.length}`,
        );
      });

      // ============================================
      // Return state update with sub-query results
      // ============================================
      return {
        subQueryResults: aggregatedResults,
        decompositionTriggered: true,
        currentStage: 'execute_sub_queries',
        metrics: {
          ...state.metrics,
          subQueryMetrics: {
            subQueriesExecuted: state.decomposedQueries.length,
            subQueryResultCount: allResults.length,
            subQueryDuration: duration,
            aggregatedResultCount: aggregatedResults.length,
            decompositionReason: 'insufficient',
          },
        },
      };
    } catch (error) {
      // ============================================
      // Error handling: Log and continue with empty results
      // Non-critical: Main query results are still available
      // ============================================
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorDuration = Date.now() - startTime;
      logger.error(
        `[ExecuteSubQueries] stage=5B_execute_sub_queries substage=error status=failed duration=${errorDuration}ms error=${errorMessage}`,
      );

      return {
        subQueryResults: [],
        decompositionTriggered: true,
        currentStage: 'execute_sub_queries_failed',
        errors: [...state.errors, `Sub-query execution error: ${errorMessage}`],
        metrics: {
          ...state.metrics,
          subQueryMetrics: {
            subQueriesExecuted: state.decomposedQueries.length,
            subQueryResultCount: 0,
            subQueryDuration: Date.now() - startTime,
            aggregatedResultCount: 0,
            decompositionReason: 'insufficient',
          },
        },
      };
    }
  };
}
