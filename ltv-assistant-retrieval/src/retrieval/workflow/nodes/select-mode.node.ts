/**
 * Select Mode Node
 * Formats final output based on retrieval mode (retrieval_only or generation)
 * Based on PRD Section "Mode Selection" (Lines 581-630)
 *
 * Pattern: Phase 5 nodes (factory function returning async node function)
 *
 * This node:
 * 1. Takes enriched contexts
 * 2. Formats them as Context[] output
 * 3. Handles both retrieval_only and generation modes (Phase 2)
 */

import { Logger } from '@nestjs/common';
import type { RetrievalStateType } from '../state/retrieval-state';
import type { Context } from '../../types';

const logger = new Logger('SelectModeNode');

/**
 * Factory function to create select mode node
 * @returns Node function for LangGraph
 */
export function createSelectModeNode() {
  return (state: RetrievalStateType): Partial<RetrievalStateType> => {
    // If no enriched contexts, return empty result
    if (state.enrichedContexts.length === 0) {
      const duration = Date.now() - state.metrics.startTime;
      logger.log(
        `[SelectMode] stage=6_select_mode substage=format status=no_contexts duration=${duration}ms`,
      );
      return {
        currentStage: 'selectMode',
        finalContexts: [],
        metrics: {
          ...state.metrics,
          endTime: Date.now(),
          totalDuration: duration,
        },
      };
    }

    logger.log(
      `[SelectMode] stage=6_select_mode substage=format status=formatting contexts=${state.enrichedContexts.length} mode=${state.mode}`,
    );

    try {
      // Format enriched contexts as final Context[] output
      const finalContexts: Context[] = state.enrichedContexts.map(
        (enriched) => {
          // Build metadata object
          const metadata: Record<string, unknown> = {};

          if (enriched.metadata.sectionPath) {
            metadata.sectionPath = enriched.metadata.sectionPath;
          }
          if (enriched.metadata.pageNumber !== undefined) {
            metadata.pageNumber = enriched.metadata.pageNumber;
          }
          if (enriched.metadata.documentTitle) {
            metadata.documentTitle = enriched.metadata.documentTitle;
          }
          if (enriched.metadata.documentType) {
            metadata.documentType = enriched.metadata.documentType;
          }

          const context: Context = {
            parentChunkId: enriched.parentChunkId,
            documentId: enriched.documentId,
            content: enriched.content,
            tokens: enriched.tokens,
            score: enriched.bestScore,
            metadata,
            sources: {
              childChunks: enriched.childChunks.map((child) => ({
                chunkId: child.chunkId,
                content: child.content,
                score: child.rerankScore,
              })),
            },
          };

          return context;
        },
      );

      const endTime = Date.now();
      const totalDuration = endTime - state.metrics.startTime;

      logger.log(
        `[SelectMode] stage=6_select_mode substage=complete status=success duration=${totalDuration}ms final_contexts=${finalContexts.length} mode=${state.mode}`,
      );

      // For Phase 1: retrieval_only mode returns contexts directly
      // For Phase 2: generation mode will use contexts for RAG answer generation
      // Current implementation: Phase 1 (retrieval_only only)

      return {
        currentStage: 'selectMode',
        finalContexts,
        metrics: {
          ...state.metrics,
          endTime,
          totalDuration,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const endTime = Date.now();
      const totalDuration = endTime - state.metrics.startTime;

      logger.error(
        `[SelectMode] stage=6_select_mode substage=error status=failed duration=${totalDuration}ms error=${errorMessage}`,
      );

      return {
        currentStage: 'selectMode',
        finalContexts: [],
        errors: [
          ...state.errors,
          `Select mode failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
        metrics: {
          ...state.metrics,
          endTime,
          totalDuration: endTime - state.metrics.startTime,
        },
      };
    }
  };
}
