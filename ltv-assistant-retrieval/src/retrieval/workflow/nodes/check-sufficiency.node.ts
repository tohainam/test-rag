/**
 * Check Sufficiency Node
 * Assesses if retrieved contexts are sufficient for answering the query
 * Based on PRD Section "Đánh giá Sufficiency" (Lines 509-580)
 *
 * Pattern: Phase 5 nodes (factory function returning async node function)
 *
 * This node:
 * 1. Calculates composite sufficiency score
 * 2. Decides whether to retry (adaptive loop)
 * 3. Uses formula: score = (highQuality/topK)*0.5 + avgScore*0.3 + minCoverage*0.2
 */

import { Logger } from '@nestjs/common';
import type { RetrievalStateType } from '../state/retrieval-state';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('CheckSufficiencyNode');

/**
 * Factory function to create check sufficiency node
 * @param configService - Config service for thresholds
 * @returns Node function for LangGraph
 */
export function createCheckSufficiencyNode(configService: ConfigService) {
  const SUFFICIENCY_THRESHOLD = configService.get<number>(
    'SUFFICIENCY_THRESHOLD',
    0.6,
  );
  const HIGH_QUALITY_THRESHOLD = configService.get<number>(
    'HIGH_QUALITY_THRESHOLD',
    0.7,
  );
  const MIN_CONTEXTS = configService.get<number>('MIN_CONTEXTS', 3);
  const MAX_RETRY_ITERATIONS = configService.get<number>(
    'MAX_RETRY_ITERATIONS',
    3,
  );

  return (state: RetrievalStateType): Partial<RetrievalStateType> => {
    // If no enriched contexts, mark as insufficient
    if (state.enrichedContexts.length === 0) {
      const shouldRetry = state.iterations < MAX_RETRY_ITERATIONS;

      logger.log(
        `[CheckSufficiency] stage=6_check_sufficiency substage=assessment status=no_contexts score=0 should_retry=${shouldRetry} iteration=${state.iterations}/${MAX_RETRY_ITERATIONS}`,
      );

      return {
        currentStage: 'checkSufficiency',
        sufficiencyScore: 0,
        shouldRetry,
      };
    }

    try {
      // Calculate metrics for sufficiency assessment
      const totalContexts = state.enrichedContexts.length;
      const topK = state.topK;

      // Count high-quality contexts (score >= HIGH_QUALITY_THRESHOLD)
      const highQualityCount = state.enrichedContexts.filter(
        (ctx) => ctx.bestScore >= HIGH_QUALITY_THRESHOLD,
      ).length;

      // Calculate average score
      const totalScore = state.enrichedContexts.reduce(
        (sum, ctx) => sum + ctx.bestScore,
        0,
      );
      const avgScore = totalScore / totalContexts;

      // Check minimum coverage (at least MIN_CONTEXTS results)
      const hasMinCoverage = totalContexts >= MIN_CONTEXTS;

      // Calculate composite sufficiency score
      // Formula: (highQuality/topK)*0.5 + avgScore*0.3 + minCoverage*0.2
      const sufficiencyScore =
        (highQualityCount / topK) * 0.5 +
        avgScore * 0.3 +
        (hasMinCoverage ? 1 : 0) * 0.2;

      // Decide whether to retry
      const isSufficient = sufficiencyScore >= SUFFICIENCY_THRESHOLD;
      const hasRetriesLeft = state.iterations < MAX_RETRY_ITERATIONS;
      const shouldRetry = !isSufficient && hasRetriesLeft;

      // Check if we should trigger decomposition
      // Trigger decomposition if:
      // 1. Results are insufficient (sufficiencyScore < threshold)
      // 2. We've reached max retries (no more adaptive retries left)
      // 3. Decomposition hasn't been triggered yet
      // 4. We have decomposed queries available
      const shouldTriggerDecomposition =
        !isSufficient &&
        !hasRetriesLeft &&
        !state.decompositionTriggered &&
        state.decomposedQueries &&
        state.decomposedQueries.length > 0;

      const decision = shouldTriggerDecomposition
        ? 'decomposition'
        : shouldRetry
          ? 'retry'
          : isSufficient
            ? 'sufficient'
            : 'insufficient';

      logger.log(
        `[CheckSufficiency] stage=6_check_sufficiency substage=assessment status=${decision} score=${sufficiencyScore.toFixed(3)} threshold=${SUFFICIENCY_THRESHOLD} contexts=${totalContexts} high_quality=${highQualityCount} avg_score=${avgScore.toFixed(3)} iteration=${state.iterations}/${MAX_RETRY_ITERATIONS}`,
      );

      return {
        currentStage: 'checkSufficiency',
        sufficiencyScore,
        shouldRetry: shouldTriggerDecomposition ? false : shouldRetry, // If decomposition triggered, don't retry normally
        decompositionTriggered: shouldTriggerDecomposition
          ? true
          : state.decompositionTriggered,
      };
    } catch (error) {
      // On error, mark as insufficient and retry if iterations left
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const shouldRetry = state.iterations < MAX_RETRY_ITERATIONS;

      logger.error(
        `[CheckSufficiency] stage=6_check_sufficiency substage=error status=failed error=${errorMessage} should_retry=${shouldRetry}`,
      );

      return {
        currentStage: 'checkSufficiency',
        sufficiencyScore: 0,
        shouldRetry,
        errors: [
          ...state.errors,
          `Sufficiency check failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  };
}
