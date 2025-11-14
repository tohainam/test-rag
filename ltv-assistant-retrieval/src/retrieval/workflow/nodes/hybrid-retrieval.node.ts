/**
 * Hybrid Retrieval Node
 * Reference: PRD Section "Hybrid Retrieval" (Lines 1686-1820)
 * Performs parallel retrieval from multiple sources:
 * - Qdrant (vector search) - PRIMARY
 * - MySQL (metadata search) - OPTIONAL (Phase 1: disabled)
 */

import { Logger } from '@nestjs/common';
import type { RetrievalState } from '../state/retrieval-state';
import { QdrantService } from '../../services/qdrant.service';
import { MySQLService } from '../../services/mysql.service';
import { DatasourceClient } from '../../clients/datasource.client';
import type { DocumentMetadata, QdrantResult } from '../../types';

const logger = new Logger('HybridRetrievalNode');

/**
 * Factory function to create hybridRetrieval node
 * Pattern: Inject services, return node function
 */
export function createHybridRetrievalNode(
  qdrantService: QdrantService,
  mysqlService: MySQLService,
  datasourceClient: DatasourceClient,
  embeddingFactory: import('../../providers/embedding-provider.factory').EmbeddingProviderFactory,
) {
  /**
   * Node function: Parallel retrieval from multiple sources
   * @param state - Current retrieval state
   * @returns Partial state update with retrieval results
   */
  return async (
    state: typeof RetrievalState.State,
  ): Promise<Partial<typeof RetrievalState.State>> => {
    const startTime = Date.now();

    logger.log(
      `[HybridRetrieval] stage=5_hybrid_retrieval substage=start status=starting topK=${state.topK}`,
    );

    // Validate prerequisites
    if (!state.queryEmbedding) {
      logger.error(
        `[HybridRetrieval] stage=5_hybrid_retrieval substage=validate status=error error=missing_query_embedding`,
      );
      return {
        currentStage: 'hybrid_retrieval_failed',
        errors: [...state.errors, 'Missing query embedding'],
      };
    }

    if (!state.accessFilter) {
      logger.error(
        `[HybridRetrieval] stage=5_hybrid_retrieval substage=validate status=error error=missing_access_filter`,
      );
      return {
        currentStage: 'hybrid_retrieval_failed',
        errors: [...state.errors, 'Missing access filter'],
      };
    }

    try {
      // ============================================
      // Parallel retrieval from all sources
      // Reference: PRD Lines 1694-1820
      // ============================================

      // Step 1: Qdrant hybrid dense+sparse search (query embedding)
      logger.log(
        `[HybridRetrieval] stage=5_hybrid_retrieval substage=qdrant status=searching`,
      );
      const qdrantResults = await qdrantService.search(
        state.queryEmbedding,
        state.accessFilter.qdrantFilter,
        state.topK,
        state.query, // Pass query text for sparse vector generation
      );
      logger.log(
        `[HybridRetrieval] stage=5_hybrid_retrieval substage=qdrant status=completed results=${qdrantResults.length}`,
      );

      // Step 1B: HyDE dual search (if HyDE embedding available)
      let hydeResults: QdrantResult[] = [];
      if (state.hydeEmbedding) {
        try {
          logger.log(
            `[HybridRetrieval] stage=5_hybrid_retrieval substage=hyde status=searching`,
          );
          hydeResults = await qdrantService.search(
            state.hydeEmbedding,
            state.accessFilter.qdrantFilter,
            Math.floor(state.topK / 2), // Half the results for HyDE search
            state.hypotheticalDoc || state.query, // Use hypothetical doc text if available
          );
          logger.log(
            `[HybridRetrieval] stage=5_hybrid_retrieval substage=hyde status=completed results=${hydeResults.length}`,
          );
        } catch (error) {
          const hydeError =
            error instanceof Error ? error.message : String(error);
          logger.warn(
            `[HybridRetrieval] stage=5_hybrid_retrieval substage=hyde status=failed error=${hydeError}`,
          );
          // Non-critical: Continue without HyDE results
        }
      } else {
        logger.log(
          `[HybridRetrieval] stage=5_hybrid_retrieval substage=hyde status=skipped reason=no_embedding`,
        );
      }

      // Step 1C: Reformulated queries multi-search (if reformulations available)
      let reformulationResults: QdrantResult[] = [];
      if (state.reformulatedQueries && state.reformulatedQueries.length > 0) {
        try {
          logger.log(
            `[HybridRetrieval] stage=5_hybrid_retrieval substage=reformulation status=searching count=${state.reformulatedQueries.length}`,
          );

          // Distribute topK across reformulated queries (minimum 3 per query)
          const limitPerReformulation = Math.max(
            3,
            Math.floor(state.topK / state.reformulatedQueries.length),
          );

          // Generate embeddings for all reformulated queries in parallel
          const embeddings = embeddingFactory.createEmbeddingModel();
          const reformulationEmbeddings = await Promise.all(
            state.reformulatedQueries.map((query) =>
              embeddings.embedQuery(query),
            ),
          );

          // Execute searches in parallel
          const reformulationSearches = await Promise.all(
            reformulationEmbeddings.map((embedding, idx) =>
              qdrantService.search(
                embedding,
                state.accessFilter?.qdrantFilter,
                limitPerReformulation,
                state.reformulatedQueries[idx], // Use reformulated query text for sparse
              ),
            ),
          );

          // Flatten and deduplicate by chunkId (keep highest score)
          const allReformulationResults = reformulationSearches.flat();
          const deduplicatedMap = new Map<string, QdrantResult>();

          allReformulationResults.forEach((result) => {
            const existing = deduplicatedMap.get(result.chunkId);
            if (!existing || result.score > existing.score) {
              deduplicatedMap.set(result.chunkId, result);
            }
          });

          reformulationResults = Array.from(deduplicatedMap.values());

          logger.log(
            `[HybridRetrieval] stage=5_hybrid_retrieval substage=reformulation status=completed total=${allReformulationResults.length} unique=${reformulationResults.length}`,
          );
        } catch (error) {
          const reformError =
            error instanceof Error ? error.message : String(error);
          logger.warn(
            `[HybridRetrieval] stage=5_hybrid_retrieval substage=reformulation status=failed error=${reformError}`,
          );
          // Non-critical: Continue without reformulation results
        }
      } else {
        logger.log(
          `[HybridRetrieval] stage=5_hybrid_retrieval substage=reformulation status=skipped reason=no_queries`,
        );
      }

      // Step 1D: Rewritten query search (if rewrite available)
      let rewriteResults: QdrantResult[] = [];
      if (state.rewrittenQuery) {
        try {
          logger.log(
            `[HybridRetrieval] stage=5_hybrid_retrieval substage=rewrite status=searching`,
          );

          // Generate embedding for rewritten query
          const embeddings = embeddingFactory.createEmbeddingModel();
          const rewriteEmbedding = await embeddings.embedQuery(
            state.rewrittenQuery,
          );

          // Search with half topK (same as HyDE)
          rewriteResults = await qdrantService.search(
            rewriteEmbedding,
            state.accessFilter?.qdrantFilter,
            Math.floor(state.topK / 2),
            state.rewrittenQuery, // Use rewritten query text for sparse
          );

          logger.log(
            `[HybridRetrieval] stage=5_hybrid_retrieval substage=rewrite status=completed results=${rewriteResults.length}`,
          );
        } catch (error) {
          const rewriteError =
            error instanceof Error ? error.message : String(error);
          logger.warn(
            `[HybridRetrieval] stage=5_hybrid_retrieval substage=rewrite status=failed error=${rewriteError}`,
          );
          // Non-critical: Continue without rewrite results
        }
      } else {
        logger.log(
          `[HybridRetrieval] stage=5_hybrid_retrieval substage=rewrite status=skipped reason=no_query`,
        );
      }

      // Step 2: MySQL metadata search via TCP + chunk retrieval
      let mysqlResults: DocumentMetadata[] = [];
      try {
        logger.log(
          `[HybridRetrieval] stage=5_hybrid_retrieval substage=mysql status=searching`,
        );
        if (state.accessFilter) {
          const documents = await datasourceClient.searchDocumentsByMetadata(
            state.query,
            state.accessFilter.whitelistDocIds,
            Math.floor(state.topK / 2),
          );

          if (documents.length > 0) {
            const fileIds = documents.flatMap((doc) => doc.fileIds);

            if (fileIds.length > 0) {
              const parentChunks =
                await mysqlService.fetchParentChunksByFileIds(fileIds);

              mysqlResults = documents
                .map((doc) => ({
                  documentId: doc.documentId,
                  title: doc.title,
                  description: doc.description,
                  type: doc.type,
                  fileType: doc.fileType,
                  chunkIds: parentChunks
                    .filter((chunk) => doc.fileIds.includes(chunk.fileId))
                    .map((chunk) => chunk.id),
                }))
                .filter((doc) => doc.chunkIds.length > 0);
            }
          }
        }
        logger.log(
          `[HybridRetrieval] stage=5_hybrid_retrieval substage=mysql status=completed results=${mysqlResults.length}`,
        );
      } catch (error) {
        const mysqlError =
          error instanceof Error ? error.message : String(error);
        logger.warn(
          `[HybridRetrieval] stage=5_hybrid_retrieval substage=mysql status=failed error=${mysqlError}`,
        );
      }

      const retrievalDuration = Date.now() - startTime;

      logger.log(
        `[HybridRetrieval] stage=5_hybrid_retrieval substage=complete status=success duration=${retrievalDuration}ms qdrant=${qdrantResults.length} hyde=${hydeResults.length} reformulation=${reformulationResults.length} rewrite=${rewriteResults.length} mysql=${mysqlResults.length}`,
      );

      // Log warning if no results found from any query-based search
      if (
        qdrantResults.length === 0 &&
        hydeResults.length === 0 &&
        reformulationResults.length === 0 &&
        rewriteResults.length === 0
      ) {
        logger.warn(
          `[HybridRetrieval] stage=5_hybrid_retrieval substage=search status=no_results`,
        );
      }

      // ============================================
      // Return state update
      // ============================================
      return {
        qdrantResults,
        hydeResults,
        reformulationResults,
        rewriteResults,
        mysqlResults,
        currentStage: 'hybrid_retrieval',
        metrics: {
          ...state.metrics,
          retrievalDuration,
          qdrantResultCount: qdrantResults.length,
          hydeResultCount: hydeResults.length,
          reformulationResultCount: reformulationResults.length,
          rewriteResultCount: rewriteResults.length,
          mysqlResultCount: mysqlResults.length,
        },
      };
    } catch (error) {
      // ============================================
      // Error handling: Log and fail
      // ============================================
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorDuration = Date.now() - startTime;
      logger.error(
        `[HybridRetrieval] stage=5_hybrid_retrieval substage=error status=failed duration=${errorDuration}ms error=${errorMessage}`,
      );

      return {
        qdrantResults: [],
        hydeResults: [],
        reformulationResults: [],
        rewriteResults: [],
        mysqlResults: [],
        currentStage: 'hybrid_retrieval_failed',
        errors: [...state.errors, `Retrieval error: ${errorMessage}`],
        metrics: {
          ...state.metrics,
          retrievalDuration: Date.now() - startTime,
          qdrantResultCount: 0,
          hydeResultCount: 0,
          reformulationResultCount: 0,
          rewriteResultCount: 0,
          mysqlResultCount: 0,
        },
      };
    }
  };
}
