/**
 * Check Cache Node
 * Performs semantic cache lookup before full retrieval
 * Based on PRD Phase 1.5 & docs/semantic-cache-design.md
 *
 * Flow:
 * - If useCache=false → skip cache (continue to retrieval)
 * - If cache HIT (similarity ≥ 0.95) → return cached contexts immediately (END)
 * - If cache MISS → continue to full retrieval pipeline
 *
 * IMPORTANT: All cached data is guaranteed to be public documents only.
 * Access type verification happens in update-cache node BEFORE saving to cache.
 * Therefore, cache hits can be returned directly without any access checks.
 *
 * Pattern: ltv-assistant-retrieval/docs/semantic-cache-design.md (Lines 531-602)
 */

import { Logger } from '@nestjs/common';
import type { Embeddings } from '@langchain/core/embeddings';
import type { RetrievalStateType } from '../state/retrieval-state';
import type { QdrantCacheService } from '../../services/qdrant-cache.service';
import type { EmbeddingProviderFactory } from '../../providers/embedding-provider.factory';

/**
 * Create check cache node factory
 * Injects required services following NestJS DI pattern
 *
 * @param qdrantCacheService - Cache service for semantic search
 * @param embeddingFactory - Factory for creating embedding model
 * @returns LangGraph node function
 */
export function createCheckCacheNode(
  qdrantCacheService: QdrantCacheService,
  embeddingFactory: EmbeddingProviderFactory,
) {
  const logger = new Logger('CheckCacheNode');

  return async (
    state: RetrievalStateType,
  ): Promise<Partial<RetrievalStateType>> => {
    const startTime = Date.now();

    // Early exit if cache disabled
    if (!state.useCache) {
      logger.log(
        `[CheckCache] stage=1.5_check_cache substage=skip status=disabled`,
      );
      return {
        cacheHit: false,
        cacheLatency: null,
        currentStage: 'check_cache_skipped',
      };
    }

    logger.log(
      `[CheckCache] stage=1.5_check_cache substage=lookup status=starting`,
    );

    try {
      // Embed query for semantic search
      // Reuse embedding for retrieval on cache miss
      const embeddings: Embeddings = embeddingFactory.createEmbeddingModel();
      const queryEmbedding = await embeddings.embedQuery(state.query);

      // Semantic search in Qdrant cache collection
      const cacheEntry = await qdrantCacheService.searchCache(
        queryEmbedding,
        state.useCache,
      );

      if (cacheEntry) {
        // ============================================
        // Cache HIT - Return cached contexts immediately
        // ============================================
        const cacheLatency = Date.now() - startTime;

        logger.log(
          `[CheckCache] stage=1.5_check_cache substage=lookup status=hit duration=${cacheLatency}ms contexts=${cacheEntry.contexts.length}`,
        );

        return {
          // Return cached contexts (skip entire retrieval pipeline)
          finalContexts: cacheEntry.contexts,

          // Cache metadata
          cacheHit: true,
          cacheLatency,
          queryEmbedding, // Store for potential use

          // Stage tracking
          currentStage: 'cache_hit',

          // Update metrics
          metrics: {
            ...state.metrics,
            cacheHit: true,
            totalDuration: cacheLatency,
            endTime: Date.now(),
          },

          // Mark as cached result
          cachedResult: true,
        };
      }

      // ============================================
      // Cache MISS - Continue to full retrieval
      // ============================================
      const missLatency = Date.now() - startTime;

      logger.log(
        `[CheckCache] stage=1.5_check_cache substage=lookup status=miss duration=${missLatency}ms`,
      );

      return {
        // Reuse embedding for retrieval (optimization)
        queryEmbedding,

        // Cache metadata
        cacheHit: false,
        cacheLatency: missLatency,

        // Stage tracking
        currentStage: 'cache_miss',

        // Update metrics
        metrics: {
          ...state.metrics,
          cacheHit: false,
        },
      };
    } catch (error) {
      // ============================================
      // Non-critical: Cache errors don't fail workflow
      // ============================================
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorDuration = Date.now() - startTime;

      logger.warn(
        `[CheckCache] stage=1.5_check_cache substage=lookup status=error duration=${errorDuration}ms error=${errorMessage}`,
      );

      return {
        cacheHit: false,
        cacheLatency: null,
        currentStage: 'cache_error',
        // Don't set queryEmbedding - let analyzeQuery handle it
      };
    }
  };
}
