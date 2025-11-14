/**
 * Reranker Service
 * Integrates with TEI/BGE-Reranker for cross-encoder reranking
 * Reference: PRD Section "Reranking Service" (Lines 1292-1423)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, {
  type AxiosInstance,
  type AxiosResponse,
  AxiosError,
} from 'axios';
import type { RerankedResult, FusedResult } from '../types';

/**
 * TEI Rerank Request
 */
interface RerankRequest {
  query: string;
  texts: string[];
  truncate?: boolean;
}

/**
 * TEI Rerank Response Item
 */
interface RerankResponseItem {
  index: number;
  score: number;
}

@Injectable()
export class RerankerService {
  private readonly logger = new Logger(RerankerService.name);
  private readonly client: AxiosInstance;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    const baseURL = this.configService.get<string>(
      'TEI_RERANKER_URL',
      'http://localhost:8080',
    );

    this.timeout = this.configService.get<number>(
      'TEI_RERANKER_TIMEOUT',
      30000,
    );

    this.client = axios.create({
      baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.logger.log(`RerankerService initialized: ${baseURL}`);
  }

  /**
   * Rerank fused results using cross-encoder
   * @param query - Original query
   * @param fusedResults - Results from RRF fusion
   * @returns Reranked results sorted by score
   */
  async rerank(
    query: string,
    fusedResults: FusedResult[],
  ): Promise<RerankedResult[]> {
    if (fusedResults.length === 0) {
      this.logger.log('No results to rerank, returning empty array');
      return [];
    }

    try {
      this.logger.log(`Reranking ${fusedResults.length} results`);

      // Filter out results with null/undefined content BEFORE reranking
      const validResults = fusedResults.filter((result) => {
        if (!result.content || result.content.trim().length === 0) {
          this.logger.warn(
            `Skipping result with empty content: chunk=${result.chunkId}`,
          );
          return false;
        }
        return true;
      });

      // Log all content for debugging
      this.logger.log(
        `Content samples (${validResults.length} valid results):`,
      );
      validResults.forEach((result, idx) => {
        this.logger.log(`[${idx}] chunkId=${result.chunkId}`);
      });

      if (validResults.length === 0) {
        this.logger.warn('No valid results with content to rerank');
        return [];
      }

      this.logger.log(
        `Filtered ${fusedResults.length} → ${validResults.length} valid results for reranking`,
      );

      // Prepare texts for reranking
      const texts = validResults.map((result) => result.content);

      // Call TEI reranker endpoint
      const request: RerankRequest = {
        query,
        texts,
        truncate: true, // Truncate long texts to fit model
      };

      // Log input data for reranker
      this.logger.log(
        `Reranker input: query="${query}", texts count=${texts.length}`,
      );

      const response: AxiosResponse<RerankResponseItem[]> =
        await this.client.post<RerankResponseItem[]>('/rerank', request);

      const rerankScores: RerankResponseItem[] = response.data;

      // Map rerank scores back to results (using validResults!)
      const rerankedResults: RerankedResult[] = rerankScores.map((item) => {
        const originalResult = validResults[item.index];
        return {
          chunkId: originalResult.chunkId,
          parentChunkId: originalResult.parentChunkId,
          documentId: originalResult.documentId,
          content: originalResult.content,
          rerankScore: item.score,
          rrfScore: originalResult.rrfScore,
        };
      });

      // Sort by rerank score (descending)
      rerankedResults.sort((a, b) => b.rerankScore - a.rerankScore);

      this.logger.log(
        `Reranking completed: ${rerankedResults.length} results reranked`,
      );

      // Log reranked results
      this.logger.log(`Reranked results (${rerankedResults.length} total):`);
      rerankedResults.forEach((result, idx) => {
        this.logger.log(
          `[${idx}] chunkId=${result.chunkId}, rerankScore=${result.rerankScore.toFixed(4)}`,
        );
      });

      return rerankedResults;
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        this.logger.warn(
          `Reranker API failed: ${error.message} (status: ${error.response?.status || 'unknown'})`,
        );
      } else {
        this.logger.warn(
          `Reranking failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Graceful fallback: return results sorted by RRF score
      this.logger.log('Falling back to RRF scores');
      return fusedResults.map((result) => ({
        chunkId: result.chunkId,
        parentChunkId: result.parentChunkId,
        documentId: result.documentId,
        content: result.content,
        rerankScore: result.rrfScore, // Use RRF score as fallback
        rrfScore: result.rrfScore,
      }));
    }
  }

  /**
   * Batch rerank with chunking for large result sets
   * @param query - Original query
   * @param fusedResults - Results from RRF fusion
   * @param batchSize - Number of results per batch (default: 100)
   * @returns Reranked results
   */
  async rerankBatch(
    query: string,
    fusedResults: FusedResult[],
    batchSize = 100,
  ): Promise<RerankedResult[]> {
    if (fusedResults.length <= batchSize) {
      return this.rerank(query, fusedResults);
    }

    this.logger.log(
      `Batch reranking: ${fusedResults.length} results in batches of ${batchSize}`,
    );

    const batches: FusedResult[][] = [];
    for (let i = 0; i < fusedResults.length; i += batchSize) {
      batches.push(fusedResults.slice(i, i + batchSize));
    }

    const batchResults = await Promise.all(
      batches.map((batch) => this.rerank(query, batch)),
    );

    // Flatten and re-sort all results
    const allResults = batchResults.flat();
    allResults.sort((a, b) => b.rerankScore - a.rerankScore);

    this.logger.log(`Batch reranking completed: ${allResults.length} results`);
    return allResults;
  }

  /**
   * Health check for reranker service
   * @returns true if service is available, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response: AxiosResponse<unknown> = await this.client.get('/health');
      this.logger.log(`Reranker health check: ${response.status}`);
      return response.status === 200;
    } catch (error: unknown) {
      this.logger.warn(
        `Reranker health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
