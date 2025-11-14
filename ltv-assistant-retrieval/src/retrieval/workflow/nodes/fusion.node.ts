/**
 * Fusion Node
 * Reference: PRD Section "Result Fusion" (Lines 1823-1934)
 * Implements Reciprocal Rank Fusion (RRF) algorithm to merge rankings
 *
 * RRF Formula: score(chunk) = Σ 1 / (k + rank_i) where k=60
 * - Deduplicates chunks appearing in multiple sources
 * - Combines RRF scores from different sources (addition, not averaging)
 * - Sorts by combined RRF score (descending)
 * - Takes top 1.5 × topK results as buffer for reranking
 */

import { Logger } from '@nestjs/common';
import type { RetrievalState } from '../state/retrieval-state';
import type { FusedResult, QdrantResult } from '../../types';

const logger = new Logger('FusionNode');

/**
 * RRF constant (industry standard)
 * Reference: PRD Line 1830
 */
const RRF_K = 60;

/**
 * Factory function to create fusion node
 * Pattern: Pure function, no dependencies needed
 */
export function createFusionNode() {
  /**
   * Node function: Fuse results from multiple sources using RRF
   * @param state - Current retrieval state
   * @returns Partial state update with fused results
   */
  return (
    state: typeof RetrievalState.State,
  ): Partial<typeof RetrievalState.State> => {
    const startTime = Date.now();

    const totalInputResults =
      state.qdrantResults.length +
      state.hydeResults.length +
      state.reformulationResults.length +
      state.rewriteResults.length +
      state.mysqlResults.length +
      (state.subQueryResults?.length || 0);

    logger.log(
      `[Fusion] stage=5_fusion substage=start status=starting total_results=${totalInputResults} qdrant=${state.qdrantResults.length} hyde=${state.hydeResults.length} reformulation=${state.reformulationResults.length} rewrite=${state.rewriteResults.length} mysql=${state.mysqlResults.length} subquery=${state.subQueryResults?.length || 0}`,
    );

    try {
      // ============================================
      // Step 1: Initialize chunk scores map
      // Reference: PRD Lines 1853-1858
      // ============================================
      const chunkScores = new Map<
        string,
        {
          chunk: QdrantResult;
          rrfScore: number;
          sources: string[];
          originalScores: Record<string, number>;
        }
      >();

      // ============================================
      // Step 2: Process Qdrant results (query embedding)
      // Reference: PRD Lines 1860-1871
      // ============================================
      state.qdrantResults.forEach((result, index) => {
        const rank = index + 1;
        const rrfScore = 1 / (RRF_K + rank);

        chunkScores.set(result.chunkId, {
          chunk: result,
          rrfScore,
          sources: ['qdrant'],
          originalScores: { qdrant: result.score },
        });
      });

      // ============================================
      // Step 2B: Process HyDE results
      // HyDE results are merged with main results using RRF
      // ============================================
      state.hydeResults.forEach((result, index) => {
        const rank = index + 1;
        const rrfScore = 1 / (RRF_K + rank);

        const existing = chunkScores.get(result.chunkId);
        if (existing) {
          // Chunk exists in multiple sources - ADD RRF score
          existing.rrfScore += rrfScore;
          existing.sources.push('hyde');
          existing.originalScores.hyde = result.score;
        } else {
          // Chunk only in HyDE results
          chunkScores.set(result.chunkId, {
            chunk: result,
            rrfScore,
            sources: ['hyde'],
            originalScores: { hyde: result.score },
          });
        }
      });

      // ============================================
      // Step 2C: Process Reformulation results
      // Each reformulated query result gets its own RRF score
      // ============================================
      state.reformulationResults.forEach((result, index) => {
        const rank = index + 1;
        const rrfScore = 1 / (RRF_K + rank);

        const existing = chunkScores.get(result.chunkId);
        if (existing) {
          // Chunk exists in multiple sources - ADD RRF score
          existing.rrfScore += rrfScore;
          existing.sources.push('reformulation');
          existing.originalScores.reformulation = result.score;
        } else {
          // Chunk only in reformulation results
          chunkScores.set(result.chunkId, {
            chunk: result,
            rrfScore,
            sources: ['reformulation'],
            originalScores: { reformulation: result.score },
          });
        }
      });

      // ============================================
      // Step 2D: Process Rewrite results
      // Rewritten query results contribute to RRF fusion
      // ============================================
      state.rewriteResults.forEach((result, index) => {
        const rank = index + 1;
        const rrfScore = 1 / (RRF_K + rank);

        const existing = chunkScores.get(result.chunkId);
        if (existing) {
          // Chunk exists in multiple sources - ADD RRF score
          existing.rrfScore += rrfScore;
          existing.sources.push('rewrite');
          existing.originalScores.rewrite = result.score;
        } else {
          // Chunk only in rewrite results
          chunkScores.set(result.chunkId, {
            chunk: result,
            rrfScore,
            sources: ['rewrite'],
            originalScores: { rewrite: result.score },
          });
        }
      });

      // ============================================
      // Step 3: Process MySQL results (if any)
      // MySQL returns DocumentMetadata with chunkIds
      // Reference: PRD Lines 1873-1887
      // ============================================
      state.mysqlResults.forEach((docMetadata, docIndex) => {
        // For each chunk ID in the document
        docMetadata.chunkIds.forEach((chunkId, chunkIndex) => {
          // Calculate synthetic rank for MySQL results
          // Lower index = higher relevance
          const rank = docIndex * 10 + chunkIndex + 1;
          const rrfScore = 1 / (RRF_K + rank);

          const existing = chunkScores.get(chunkId);
          if (existing) {
            // Chunk exists in multiple sources - ADD RRF score
            existing.rrfScore += rrfScore;
            existing.sources.push('mysql');
            existing.originalScores.mysql = 1.0 / (chunkIndex + 1); // Synthetic score

            // Attach document metadata for enrichment
            existing.chunk.metadata = {
              ...existing.chunk.metadata,
              documentTitle: docMetadata.title,
              documentType: docMetadata.type,
              documentDescription: docMetadata.description,
              fileType: docMetadata.fileType,
            };
          } else {
            // Chunk only in MySQL (not in Qdrant)
            // This is rare but possible if document metadata matches but vector search missed it
            logger.debug(
              `Chunk ${chunkId} found only in MySQL metadata (not in Qdrant)`,
            );
            // Skip for now - we don't have the chunk content from Qdrant
            // Future enhancement: Could fetch chunk content from Qdrant by ID
          }
        });
      });

      // ============================================
      // Step 3B: Process sub-query results (if any)
      // Reference: Query Decomposition Execution Implementation
      // ============================================
      if (state.subQueryResults && state.subQueryResults.length > 0) {
        logger.log(
          `[Fusion] stage=5_fusion substage=subquery_fusion status=processing count=${state.subQueryResults.length}`,
        );

        state.subQueryResults.forEach((result, index) => {
          const rank = index + 1;
          const rrfScore = 1 / (RRF_K + rank);

          const existing = chunkScores.get(result.chunkId);
          if (existing) {
            // Chunk exists in multiple sources - ADD RRF score
            existing.rrfScore += rrfScore;
            existing.sources.push('subquery');
            existing.originalScores.subquery = result.score;
          } else {
            // Chunk only in sub-query results
            chunkScores.set(result.chunkId, {
              chunk: result,
              rrfScore,
              sources: ['subquery'],
              originalScores: { subquery: result.score },
            });
          }
        });
      }

      // ============================================
      // Step 4: Sort by RRF score and take top 1.5 × topK
      // Reference: PRD Lines 1890-1901
      // ============================================
      const bufferSize = Math.ceil(state.topK * 1.5);

      const fusedResults: FusedResult[] = Array.from(chunkScores.values())
        .sort((a, b) => b.rrfScore - a.rrfScore) // Descending order
        .slice(0, bufferSize) // Take top 1.5x for reranking buffer
        .map((item) => ({
          chunkId: item.chunk.chunkId,
          parentChunkId: item.chunk.parentChunkId,
          documentId: item.chunk.documentId,
          content: item.chunk.content,
          rrfScore: item.rrfScore,
          sources: item.sources,
          originalScores: item.originalScores,
          // Include document metadata if available from MySQL
          documentMetadata: item.chunk.metadata?.documentTitle
            ? {
                title: item.chunk.metadata.documentTitle as string,
                description: item.chunk.metadata.documentDescription as
                  | string
                  | undefined,
                type: item.chunk.metadata.documentType as string,
                fileType: item.chunk.metadata.fileType as string | undefined,
              }
            : undefined,
        }));

      const fusionDuration = Date.now() - startTime;

      logger.log(
        `[Fusion] stage=5_fusion substage=complete status=success duration=${fusionDuration}ms input=${totalInputResults} output=${fusedResults.length} buffer=${bufferSize}`,
      );

      // Log top 3 results for debugging
      if (fusedResults.length > 0) {
        const topScores = fusedResults
          .slice(0, 3)
          .map((r) => r.rrfScore.toFixed(4))
          .join(',');
        logger.debug(
          `[Fusion] stage=5_fusion substage=top_scores top_3_rrf=${topScores}`,
        );
      }

      // ============================================
      // Return state update
      // ============================================
      return {
        fusedResults,
        currentStage: 'fusion',
        metrics: {
          ...state.metrics,
          fusionDuration,
          fusedResultCount: fusedResults.length,
          deduplicatedCount: totalInputResults - chunkScores.size, // How many duplicates found
        },
      };
    } catch (error) {
      // ============================================
      // Error handling: Log and fail
      // Reference: PRD Lines 1917-1923
      // ============================================
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorDuration = Date.now() - startTime;
      logger.error(
        `[Fusion] stage=5_fusion substage=error status=failed duration=${errorDuration}ms error=${errorMessage}`,
      );

      return {
        fusedResults: [],
        currentStage: 'fusion_failed',
        errors: [...state.errors, `Fusion error: ${errorMessage}`],
        metrics: {
          ...state.metrics,
          fusionDuration: Date.now() - startTime,
          fusedResultCount: 0,
        },
      };
    }
  };
}
