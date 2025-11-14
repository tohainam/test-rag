/**
 * Update Cache Node
 * Stores retrieval results in semantic cache (public documents only)
 * Based on PRD Phase 1.5 & docs/semantic-cache-design.md
 *
 * Safety: ONLY caches if ALL documents are public
 * Fetches document details from datasource service to verify access type
 *
 * Pattern: ltv-assistant-retrieval/docs/semantic-cache-design.md (Lines 604-651)
 */

import { Logger } from '@nestjs/common';
import type { RetrievalStateType } from '../state/retrieval-state';
import type { QdrantCacheService } from '../../services/qdrant-cache.service';
import type { DatasourceClient } from '../../clients/datasource.client';

const logger = new Logger('UpdateCacheNode');

/**
 * Create update cache node factory
 * Injects cache service and datasource client following NestJS DI pattern
 *
 * @param qdrantCacheService - Cache service for storing results
 * @param datasourceClient - Client for fetching document details
 * @returns LangGraph node function
 */
export function createUpdateCacheNode(
  qdrantCacheService: QdrantCacheService,
  datasourceClient: DatasourceClient,
) {
  return async (
    state: RetrievalStateType,
  ): Promise<Partial<RetrievalStateType>> => {
    const startTime = Date.now();

    // ============================================
    // Skip Conditions
    // ============================================

    // Skip if cache disabled
    if (!state.useCache) {
      logger.log(
        `[UpdateCache] stage=1.5_update_cache substage=skip status=cache_disabled`,
      );
      return {
        currentStage: 'update_cache_skipped',
      };
    }

    // Skip if already a cache hit (no need to re-cache)
    if (state.cacheHit) {
      logger.log(
        `[UpdateCache] stage=1.5_update_cache substage=skip status=cache_hit`,
      );
      return {
        currentStage: 'update_cache_skipped',
      };
    }

    // Skip if no query embedding (can't cache without embedding)
    if (!state.queryEmbedding) {
      logger.warn(
        `[UpdateCache] stage=1.5_update_cache substage=skip status=no_embedding`,
      );
      return {
        currentStage: 'update_cache_skipped',
      };
    }

    // Skip if no contexts to cache
    if (state.finalContexts.length === 0) {
      logger.log(
        `[UpdateCache] stage=1.5_update_cache substage=skip status=no_contexts`,
      );
      return {
        currentStage: 'update_cache_skipped',
      };
    }

    logger.log(
      `[UpdateCache] stage=1.5_update_cache substage=verify status=checking_access contexts=${state.finalContexts.length}`,
    );

    try {
      // ============================================
      // Safety Check: Verify ALL documents are public
      // ============================================

      // Extract unique document IDs from contexts
      const uniqueDocIds = [
        ...new Set(state.finalContexts.map((c) => c.documentId)),
      ];

      if (uniqueDocIds.length === 0) {
        return {
          currentStage: 'update_cache_skipped',
        };
      }

      // Fetch document details from datasource service
      const documentDetails =
        await datasourceClient.getDocumentDetails(uniqueDocIds);

      // Check if we got details for all documents
      if (documentDetails.length !== uniqueDocIds.length) {
        logger.warn(
          `[UpdateCache] stage=1.5_update_cache substage=verify status=incomplete_details requested=${uniqueDocIds.length} received=${documentDetails.length}`,
        );
        return {
          currentStage: 'update_cache_skipped',
        };
      }

      // Check if ALL documents are public
      const allPublic = documentDetails.every(
        (doc) => doc.accessType === 'public',
      );

      if (!allPublic) {
        const publicCount = documentDetails.filter(
          (doc) => doc.accessType === 'public',
        ).length;
        logger.log(
          `[UpdateCache] stage=1.5_update_cache substage=verify status=not_all_public total=${documentDetails.length} public=${publicCount}`,
        );
        return {
          currentStage: 'update_cache_skipped',
        };
      }

      // ============================================
      // Store in cache (all documents are public)
      // ============================================

      logger.log(
        `[UpdateCache] stage=1.5_update_cache substage=store status=storing docs=${uniqueDocIds.length}`,
      );

      await qdrantCacheService.storeCache(
        state.queryEmbedding,
        state.query,
        state.finalContexts,
        state.useCache,
      );

      const updateLatency = Date.now() - startTime;

      logger.log(
        `[UpdateCache] stage=1.5_update_cache substage=complete status=success duration=${updateLatency}ms docs=${uniqueDocIds.length}`,
      );

      return {
        currentStage: 'update_cache',
        metrics: {
          ...state.metrics,
          cacheUpdateLatency: updateLatency,
        },
      };
    } catch (error) {
      // ============================================
      // Non-critical: Cache update errors don't fail workflow
      // ============================================
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorDuration = Date.now() - startTime;

      logger.warn(
        `[UpdateCache] stage=1.5_update_cache substage=error status=failed duration=${errorDuration}ms error=${errorMessage}`,
      );

      return {
        currentStage: 'update_cache_failed',
        // Don't add to errors array - cache failures are non-critical
      };
    }
  };
}
