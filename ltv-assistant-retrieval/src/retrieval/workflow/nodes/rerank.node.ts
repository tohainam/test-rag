/**
 * Rerank Node
 * Cross-encoder reranking using BGE-Reranker via TEI
 * Based on PRD Section "Reranking Node" (Lines 387-440)
 *
 * Pattern: Phase 5 nodes (factory function returning async node function)
 *
 * This node:
 * 1. Takes fused results from fusion node
 * 2. Calls RerankerService to rerank with cross-encoder
 * 3. Filters by threshold (RERANK_THRESHOLD env var)
 * 4. Falls back to RRF scores if reranker fails
 * 5. Returns top-K reranked results
 */

import type { ConfigService } from '@nestjs/config';
import type { RetrievalStateType } from '../state/retrieval-state';
import type { RerankerService } from '../../services/reranker.service';
import type { RerankedResult } from '../../types';
import { Logger } from '@nestjs/common';

const logger = new Logger('RerankNode');

/**
 * Factory function to create rerank node
 * @param rerankerService - Reranker service instance
 * @param configService - Config service for threshold
 * @returns Node function for LangGraph
 */
export function createRerankNode(
  rerankerService: RerankerService,
  configService: ConfigService,
) {
  return async (
    state: RetrievalStateType,
  ): Promise<Partial<RetrievalStateType>> => {
    const startTime = Date.now();

    // Skip reranking if no fused results
    if (state.fusedResults.length === 0) {
      logger.log(`[Rerank] stage=6_rerank substage=skip status=no_results`);
      return {
        currentStage: 'rerank',
        rerankedResults: [],
        metrics: {
          ...state.metrics,
          rerankingDuration: Date.now() - startTime,
          rerankedResultCount: 0,
        },
      };
    }

    logger.log(
      `[Rerank] stage=6_rerank substage=start status=starting input=${state.fusedResults.length}`,
    );

    try {
      // Call reranker service (handles fallback internally)
      const rerankedResults = await rerankerService.rerank(
        state.query,
        state.fusedResults,
      );

      // Get threshold from config (default: 0.0 to filter negative scores)
      const threshold = configService.get<number>(
        'RERANK_SCORE_THRESHOLD',
        0.0,
      );

      // Filter by threshold (only accept scores > threshold)
      // BGE-Reranker-v2-m3 produces raw scores that can be negative for irrelevant results
      const filteredResults = rerankedResults.filter(
        (result) => result.rerankScore > threshold,
      );

      // Log filtering statistics
      const filteredCount = rerankedResults.length - filteredResults.length;
      if (filteredCount > 0) {
        logger.log(
          `[Rerank] stage=6_rerank substage=filtering filtered_out=${filteredCount} total=${rerankedResults.length} threshold=${threshold}`,
        );
      }

      // Log score distribution for debugging
      if (rerankedResults.length > 0) {
        const scores = rerankedResults.map((r) => r.rerankScore);
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);
        const avgScore =
          scores.reduce((sum, score) => sum + score, 0) / scores.length;
        logger.debug(
          `[Rerank] stage=6_rerank substage=scores min=${minScore.toFixed(4)} max=${maxScore.toFixed(4)} avg=${avgScore.toFixed(4)}`,
        );
      }

      // Fallback: If all results filtered by threshold, return top N from reranked results
      let topKResults: RerankedResult[];
      let fallbackTriggered = false;

      if (filteredResults.length === 0 && rerankedResults.length > 0) {
        // Get fallback count from config (default: 3)
        const fallbackCount = configService.get<number>(
          'RERANK_FALLBACK_COUNT',
          3,
        );

        // Take top N from reranked results (ignore threshold)
        topKResults = rerankedResults.slice(
          0,
          Math.min(fallbackCount, rerankedResults.length),
        );
        fallbackTriggered = true;

        logger.warn(
          `[Rerank] stage=6_rerank substage=threshold_fallback status=all_filtered total=${rerankedResults.length} threshold=${threshold} returning=${topKResults.length}`,
        );
      } else {
        // Normal case: take top-K from filtered results
        topKResults = filteredResults.slice(0, state.topK);
      }

      const duration = Date.now() - startTime;

      logger.log(
        `[Rerank] stage=6_rerank substage=complete status=success duration=${duration}ms input=${state.fusedResults.length} output=${topKResults.length} fallback=${fallbackTriggered}`,
      );

      return {
        currentStage: 'rerank',
        rerankedResults: topKResults,
        metrics: {
          ...state.metrics,
          rerankingDuration: duration,
          rerankedResultCount: topKResults.length,
          rerankFallbackTriggered: fallbackTriggered,
        },
      };
    } catch (error) {
      // Fallback: use RRF scores as rerank scores
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;

      logger.error(
        `[Rerank] stage=6_rerank substage=error status=failed duration=${duration}ms error=${errorMessage} fallback=rrf_scores`,
      );

      const fallbackResults = state.fusedResults
        .map((result) => ({
          chunkId: result.chunkId,
          parentChunkId: result.parentChunkId,
          documentId: result.documentId,
          content: result.content,
          rerankScore: result.rrfScore,
          rrfScore: result.rrfScore,
        }))
        .sort((a, b) => b.rerankScore - a.rerankScore)
        .slice(0, state.topK);

      return {
        currentStage: 'rerank',
        rerankedResults: fallbackResults,
        errors: [
          ...state.errors,
          `Reranking failed: ${error instanceof Error ? error.message : String(error)} (using RRF fallback)`,
        ],
        metrics: {
          ...state.metrics,
          rerankingDuration: duration,
          rerankedResultCount: fallbackResults.length,
        },
      };
    }
  };
}
