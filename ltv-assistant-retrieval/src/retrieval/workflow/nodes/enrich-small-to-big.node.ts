/**
 * Small-to-Big Enrichment Node
 * Fetches parent chunks (~1800 tokens) to provide context for child chunks (~512 tokens)
 * Based on PRD Section "Small-to-Big Strategy" (Lines 441-508)
 *
 * Pattern: Phase 5 nodes (factory function returning async node function)
 *
 * This node:
 * 1. Groups reranked children by parentChunkId
 * 2. Fetches parent chunks from MySQL
 * 3. Creates EnrichedContext[] with parent content + child chunks
 * 4. Calculates best score per parent (highest child score)
 */

import { Logger } from '@nestjs/common';
import type { RetrievalStateType } from '../state/retrieval-state';
import type { MySQLService } from '../../services/mysql.service';
import type { EnrichedContext } from '../../types';

const logger = new Logger('EnrichNode');

/**
 * Factory function to create enrich node
 * @param mysqlService - MySQL service for parent chunk retrieval
 * @returns Node function for LangGraph
 */
export function createEnrichNode(mysqlService: MySQLService) {
  return async (
    state: RetrievalStateType,
  ): Promise<Partial<RetrievalStateType>> => {
    const startTime = Date.now();

    // Skip enrichment if no reranked results
    if (state.rerankedResults.length === 0) {
      logger.log(`[Enrich] stage=6_enrich substage=skip status=no_results`);
      return {
        currentStage: 'enrich',
        enrichedContexts: [],
        metrics: {
          ...state.metrics,
          enrichmentDuration: Date.now() - startTime,
          parentChunkCount: 0,
        },
      };
    }

    logger.log(
      `[Enrich] stage=6_enrich substage=start status=starting children=${state.rerankedResults.length}`,
    );

    try {
      // Group children by parentChunkId
      const childrenByParent = new Map<
        string,
        Array<{
          chunkId: string;
          content: string;
          rerankScore: number;
        }>
      >();

      state.rerankedResults.forEach((result) => {
        const existing = childrenByParent.get(result.parentChunkId) || [];
        existing.push({
          chunkId: result.chunkId,
          content: result.content,
          rerankScore: result.rerankScore,
        });
        childrenByParent.set(result.parentChunkId, existing);
      });

      // Extract unique parent chunk IDs
      const parentChunkIds = Array.from(childrenByParent.keys());

      logger.log(
        `[Enrich] stage=6_enrich substage=fetch_parents status=fetching parent_ids=${parentChunkIds.length}`,
      );

      // Fetch parent chunks from MySQL
      const parentChunks = await mysqlService.fetchParentChunks(parentChunkIds);

      // Create map for quick lookup
      const parentChunkMap = new Map(
        parentChunks.map((chunk) => [chunk.id, chunk]),
      );

      // Build EnrichedContext array
      const enrichedContexts: EnrichedContext[] = [];

      for (const [parentChunkId, children] of childrenByParent.entries()) {
        const parentChunk = parentChunkMap.get(parentChunkId);

        // Skip if parent chunk not found in database
        if (!parentChunk) {
          continue;
        }

        // Find best (highest) score among children
        const bestScore = Math.max(...children.map((c) => c.rerankScore));

        // Extract metadata from parent chunk
        const parentMetadata =
          typeof parentChunk.metadata === 'object' &&
          parentChunk.metadata !== null
            ? (parentChunk.metadata as Record<string, unknown>)
            : {};

        // Get first child's document ID (all children should have same documentId)
        const documentId =
          state.rerankedResults.find((r) => r.parentChunkId === parentChunkId)
            ?.documentId || '';

        const enrichedContext: EnrichedContext = {
          parentChunkId,
          documentId,
          content: parentChunk.content,
          tokens: parentChunk.tokens,
          metadata: {
            sectionPath:
              parentMetadata.sectionPath &&
              Array.isArray(parentMetadata.sectionPath)
                ? (parentMetadata.sectionPath as string[])
                : undefined,
            pageNumber:
              parentMetadata.pageNumber &&
              typeof parentMetadata.pageNumber === 'number'
                ? parentMetadata.pageNumber
                : undefined,
            documentTitle:
              parentMetadata.documentTitle &&
              typeof parentMetadata.documentTitle === 'string'
                ? parentMetadata.documentTitle
                : undefined,
            documentType:
              parentMetadata.documentType &&
              typeof parentMetadata.documentType === 'string'
                ? parentMetadata.documentType
                : undefined,
          },
          childChunks: children,
          bestScore,
        };

        enrichedContexts.push(enrichedContext);
      }

      // Sort by bestScore descending
      enrichedContexts.sort((a, b) => b.bestScore - a.bestScore);

      const duration = Date.now() - startTime;

      logger.log(
        `[Enrich] stage=6_enrich substage=complete status=success duration=${duration}ms children=${state.rerankedResults.length} parents=${enrichedContexts.length}`,
      );

      return {
        currentStage: 'enrich',
        enrichedContexts,
        metrics: {
          ...state.metrics,
          enrichmentDuration: duration,
          parentChunkCount: enrichedContexts.length,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;

      logger.error(
        `[Enrich] stage=6_enrich substage=error status=failed duration=${duration}ms error=${errorMessage}`,
      );

      return {
        currentStage: 'enrich',
        enrichedContexts: [],
        errors: [
          ...state.errors,
          `Enrichment failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
        metrics: {
          ...state.metrics,
          enrichmentDuration: duration,
          parentChunkCount: 0,
        },
      };
    }
  };
}
