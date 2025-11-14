/**
 * Analyze Query Node
 * Reference: PRD Section "Query Analysis & Transformation" (Lines 1149-1253)
 * Implements 4 query transformation techniques in PARALLEL:
 * 1. Query Reformulation (temp 0.7) - 3-5 variations
 * 2. Query Rewrite (temp 0.3) - clarify intent
 * 3. HyDE (temp 0.5) - hypothetical document
 * 4. Query Decomposition (temp 0.4) - 2-4 sub-queries
 */

import { Logger } from '@nestjs/common';
import type { RetrievalState } from '../state/retrieval-state';
import { EmbeddingProviderFactory } from '../../providers/embedding-provider.factory';
import { QueryTransformationService } from '../../services/query-transformation.service';

const logger = new Logger('AnalyzeQueryNode');

/**
 * Factory function to create analyzeQuery node
 * Pattern: Inject services, return node function
 */
export function createAnalyzeQueryNode(
  embeddingFactory: EmbeddingProviderFactory,
  queryTransformationService: QueryTransformationService,
) {
  /**
   * Node function: Transform query and generate embeddings
   * @param state - Current retrieval state
   * @returns Partial state update with transformations and embeddings
   */
  return async (
    state: typeof RetrievalState.State,
  ): Promise<Partial<typeof RetrievalState.State>> => {
    const startTime = Date.now();

    // Increment iterations on each pass through this node
    // First run: 0 -> 1, Second run: 1 -> 2, etc.
    const currentIteration = state.iterations + 1;

    logger.log(
      `[AnalyzeQuery] stage=4_analyze_query substage=start status=starting iteration=${currentIteration}`,
    );

    try {
      // ============================================
      // Phase 1: Apply ALL 4 query transformation techniques in PARALLEL
      // Reference: PRD Lines 1187-1198
      // ============================================
      logger.log(
        `[AnalyzeQuery] stage=4_analyze_query substage=transformations status=parallel_execution`,
      );

      const [
        reformulatedQueries,
        rewrittenQuery,
        hypotheticalDoc,
        decomposedQueries,
      ] = await Promise.all([
        queryTransformationService.reformulateQuery(state.query), // Temp 0.7
        queryTransformationService.rewriteQuery(state.query), // Temp 0.3
        queryTransformationService.generateHyDE(state.query), // Temp 0.5
        queryTransformationService.decomposeQuery(state.query), // Temp 0.4
      ]);

      logger.log(
        `[AnalyzeQuery] stage=4_analyze_query substage=transformations status=completed reformulated=${reformulatedQueries.length} decomposed=${decomposedQueries.length} rewrite=${!!rewrittenQuery} hyde=${!!hypotheticalDoc}`,
      );

      // ============================================
      // Phase 2: Generate embeddings
      // Reference: PRD Lines 1200-1209
      // ============================================
      logger.log(
        `[AnalyzeQuery] stage=4_analyze_query substage=embeddings status=generating`,
      );

      const embeddings = embeddingFactory.createEmbeddingModel();

      // Original query embedding (always generated)
      const queryEmbedding = await embeddings.embedQuery(state.query);

      // HyDE embedding (only if hypothetical document was generated)
      // Embed the hypothetical answer instead of the query
      const hydeEmbedding = hypotheticalDoc
        ? await embeddings.embedQuery(hypotheticalDoc)
        : null;

      logger.log(
        `[AnalyzeQuery] stage=4_analyze_query substage=embeddings status=completed query_dim=${queryEmbedding.length} hyde_dim=${hydeEmbedding ? hydeEmbedding.length : 0}`,
      );

      // Validate embedding dimensions (should be 1024 for bge-m3:567m)
      if (queryEmbedding.length !== 1024) {
        logger.warn(
          `[AnalyzeQuery] stage=4_analyze_query substage=embeddings status=dimension_warning expected=1024 actual=${queryEmbedding.length}`,
        );
      }

      // ============================================
      // Phase 3: Return state update
      // Reference: PRD Lines 1220-1245
      // ============================================
      const analysisDuration = Date.now() - startTime;

      logger.log(
        `[AnalyzeQuery] stage=4_analyze_query substage=complete status=success duration=${analysisDuration}ms iteration=${currentIteration}`,
      );

      return {
        // Embeddings
        queryEmbedding,
        hydeEmbedding,

        // Transformed queries
        reformulatedQueries,
        rewrittenQuery,
        hypotheticalDoc,
        decomposedQueries,

        // Adaptive loop control
        iterations: currentIteration,

        // Stage tracking
        currentStage: 'analyze_query',

        // Metrics
        metrics: {
          ...state.metrics,
          analysisDuration,
          transformationMetrics: {
            reformulatedCount: reformulatedQueries.length,
            decomposedCount: decomposedQueries.length,
            rewriteApplied: !!rewrittenQuery,
            hydeApplied: !!hypotheticalDoc,
          },
        },
      };
    } catch (error) {
      // ============================================
      // Error handling: Log and continue
      // Reference: PRD Lines 1246-1252
      // ============================================
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorDuration = Date.now() - startTime;
      logger.error(
        `[AnalyzeQuery] stage=4_analyze_query substage=error status=failed duration=${errorDuration}ms error=${errorMessage}`,
      );

      return {
        // Failed state - return empty transformations
        queryEmbedding: null,
        hydeEmbedding: null,
        reformulatedQueries: [],
        rewrittenQuery: null,
        hypotheticalDoc: null,
        decomposedQueries: [],

        // Track error
        currentStage: 'analyze_query_failed',
        errors: [...state.errors, `Analysis error: ${errorMessage}`],

        // Partial metrics
        metrics: {
          ...state.metrics,
          analysisDuration: Date.now() - startTime,
        },
      };
    }
  };
}
