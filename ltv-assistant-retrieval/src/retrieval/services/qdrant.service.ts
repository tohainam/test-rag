/**
 * Qdrant Service
 * Handles vector search operations in Qdrant
 * Reference: PRD Section "Vector Search Service" (Lines 849-995)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import type { QdrantResult, QdrantFilter } from '../types';
import { SparseEmbeddingService } from './sparse-embedding.service';

@Injectable()
export class QdrantService {
  private readonly logger = new Logger(QdrantService.name);
  private readonly client: QdrantClient;

  // Multi-vector retrieval: search across 3 collections
  private readonly COLLECTION_CHILDREN = 'documents_children';
  private readonly COLLECTION_SUMMARIES = 'documents_summaries';
  private readonly COLLECTION_QUESTIONS = 'documents_questions';

  constructor(
    private readonly configService: ConfigService,
    private readonly sparseEmbeddingService: SparseEmbeddingService,
  ) {
    const url = this.configService.get<string>(
      'QDRANT_URL',
      'http://localhost:6333',
    );

    this.client = new QdrantClient({ url });

    this.logger.log(`QdrantClient initialized: ${url}`);
    this.logger.log(
      `Multi-vector collections: ${this.COLLECTION_CHILDREN}, ${this.COLLECTION_SUMMARIES}, ${this.COLLECTION_QUESTIONS}`,
    );
  }

  /**
   * Multi-vector search across all 3 collections with access control filter
   * Searches children, summaries, and questions collections in parallel
   * Uses hybrid dense + sparse search for each collection
   * @param embedding - Query embedding vector (dense)
   * @param filter - Access control filter (optional)
   * @param limit - Number of results per collection (default: 20)
   * @param queryText - Original query text for sparse vector generation (optional)
   * @returns Array of QdrantResult merged and deduplicated by parentChunkId
   */
  async search(
    embedding: number[],
    filter?: QdrantFilter,
    limit = 20,
    queryText?: string,
  ): Promise<QdrantResult[]> {
    try {
      this.logger.log(
        `Multi-vector search: limit=${limit}/collection, hasFilter=${!!filter}, hybrid=${!!queryText}`,
      );

      // Search all 3 collections in parallel with hybrid dense+sparse
      const [childrenResults, summariesResults, questionsResults] =
        await Promise.all([
          this.searchCollection(
            this.COLLECTION_CHILDREN,
            embedding,
            filter,
            limit,
            queryText,
          ),
          this.searchCollection(
            this.COLLECTION_SUMMARIES,
            embedding,
            filter,
            Math.floor(limit / 2),
            queryText,
          ), // Fewer summaries
          this.searchCollection(
            this.COLLECTION_QUESTIONS,
            embedding,
            filter,
            Math.floor(limit / 2),
            queryText,
          ), // Fewer questions
        ]);

      // Merge results: Use Map to deduplicate by parentChunkId
      // Keep highest score for each parentChunkId
      const mergedMap = new Map<string, QdrantResult>();

      // Add children results (primary - highest weight)
      childrenResults.forEach((result) => {
        const key = result.parentChunkId || result.chunkId;
        mergedMap.set(key, result);
      });

      // Add summaries results (merge with children, boost score slightly)
      summariesResults.forEach((result) => {
        const key = result.parentChunkId || result.chunkId;
        const existing = mergedMap.get(key);
        if (existing) {
          // If child chunk exists, boost its score based on summary match
          // PRESERVE the child chunk's content, only update score
          if (result.score > existing.score) {
            existing.score = result.score * 1.05;
          }
        } else {
          // No child chunk found - add summary result
          // Note: Summary results don't have 'content' field (only summary text)
          mergedMap.set(key, { ...result, score: result.score * 1.05 });
        }
      });

      // Add questions results (merge with children, boost score)
      questionsResults.forEach((result) => {
        const key = result.parentChunkId || result.chunkId;
        const existing = mergedMap.get(key);
        if (existing) {
          // If child chunk exists, boost its score based on question match
          // PRESERVE the child chunk's content, only update score
          if (result.score > existing.score) {
            existing.score = result.score * 1.1;
          }
        } else {
          // No child chunk found - add question result
          // Note: Question results don't have 'content' field (only question text)
          mergedMap.set(key, { ...result, score: result.score * 1.1 });
        }
      });

      // Sort by score and take top limit results
      const mergedResults = Array.from(mergedMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      this.logger.log(
        `Multi-vector search completed: ${childrenResults.length} children + ${summariesResults.length} summaries + ${questionsResults.length} questions → ${mergedResults.length} merged`,
      );

      return mergedResults;
    } catch (error) {
      this.logger.error(
        `Multi-vector search failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return []; // Graceful fallback
    }
  }

  /**
   * Search a single collection with hybrid dense + sparse search
   * Uses Qdrant's query API to combine dense and sparse vectors with RRF
   * @param collectionName - Qdrant collection name
   * @param embedding - Query embedding vector (dense)
   * @param queryText - Query text for sparse vector generation
   * @param filter - Access control filter (optional)
   * @param limit - Number of results
   * @returns Array of QdrantResult
   */
  private async searchCollection(
    collectionName: string,
    embedding: number[],
    filter?: QdrantFilter,
    limit = 20,
    queryText?: string,
  ): Promise<QdrantResult[]> {
    try {
      // Generate sparse vector using BM25-like algorithm (matches indexing service)
      const sparseVector = queryText
        ? this.sparseEmbeddingService.generateSparseEmbedding(queryText)
        : null;

      // Use Qdrant's query API for hybrid dense + sparse search with RRF
      const queryParams = {
        prefetch: [
          // Dense vector search
          {
            query: embedding,
            using: 'dense',
            limit: limit * 2, // Get more for RRF fusion
            ...(filter && { filter }),
          },
          // Sparse vector search (BM25-like) - only if we have query text
          ...(sparseVector
            ? [
                {
                  query: {
                    indices: sparseVector.indices,
                    values: sparseVector.values,
                  },
                  using: 'sparse',
                  limit: limit * 2, // Get more for RRF fusion
                  ...(filter && { filter }),
                },
              ]
            : []),
        ],
        query: {
          // RRF fusion of dense + sparse results
          fusion: 'rrf', // Reciprocal Rank Fusion
        },
        limit,
        with_payload: true,
      };

      const searchResult = await this.client.query(collectionName, queryParams);

      const results: QdrantResult[] = (searchResult.points || []).map(
        (point) => {
          // Handle different collection types:
          // - children: use 'content' field
          // - summaries: use 'summary' field as content
          // - questions: use 'question' field as content
          const content =
            (point.payload?.content as string) ||
            (point.payload?.summary as string) ||
            (point.payload?.question as string) ||
            '';

          return {
            chunkId:
              (point.payload?.chunkId as string) ||
              (point.payload?.summaryId as string) ||
              (point.payload?.questionId as string) ||
              String(point.id),
            parentChunkId: point.payload?.parentChunkId as string,
            documentId: point.payload?.documentId as string,
            content,
            score: point.score || 0,
            metadata:
              (point.payload?.metadata as Record<string, unknown>) || {},
          };
        },
      );

      this.logger.log(
        `Collection ${collectionName}: ${results.length} results (hybrid dense+sparse with RRF)`,
      );
      return results;
    } catch (error) {
      this.logger.warn(
        `Hybrid search failed in ${collectionName}, falling back to dense-only: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fallback to dense-only search if hybrid fails
      try {
        const searchParams = {
          vector: {
            name: 'dense',
            vector: embedding,
          },
          limit,
          with_payload: true,
          ...(filter && { filter }),
        };

        const searchResult = await this.client.search(
          collectionName,
          searchParams,
        );

        const results: QdrantResult[] = searchResult.map((point) => {
          // Handle different collection types (same as above)
          const content =
            (point.payload?.content as string) ||
            (point.payload?.summary as string) ||
            (point.payload?.question as string) ||
            '';

          return {
            chunkId:
              (point.payload?.chunkId as string) ||
              (point.payload?.summaryId as string) ||
              (point.payload?.questionId as string) ||
              '',
            parentChunkId: point.payload?.parentChunkId as string,
            documentId: point.payload?.documentId as string,
            content,
            score: point.score,
            metadata:
              (point.payload?.metadata as Record<string, unknown>) || {},
          };
        });

        this.logger.log(
          `Collection ${collectionName}: ${results.length} results (fallback dense-only)`,
        );
        return results;
      } catch (fallbackError) {
        this.logger.error(
          `Both hybrid and dense-only search failed in ${collectionName}: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        );
        return [];
      }
    }
  }

  /**
   * Health check for Qdrant service
   * @returns true if service is available, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.getCollections();
      this.logger.log('Qdrant health check: OK');
      return true;
    } catch (error) {
      this.logger.warn(
        `Qdrant health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
