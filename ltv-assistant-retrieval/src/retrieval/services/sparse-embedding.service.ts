/**
 * Sparse Embedding Service for Query-time BM25
 * Matches the indexing service's sparse embedding generation
 * Note: At query time, we don't have full corpus statistics (IDF, avgDocLength)
 * so we use simplified TF-based scoring
 */

import { Injectable, Logger } from '@nestjs/common';

export interface SparseVector {
  indices: number[];
  values: number[];
}

@Injectable()
export class SparseEmbeddingService {
  private readonly logger = new Logger(SparseEmbeddingService.name);

  // Simple vocabulary for query-time hashing
  // Note: This must match the indexing service's term ID generation
  private vocabulary: Map<string, number> = new Map();

  /**
   * Generate sparse embedding for query text
   * Uses simplified BM25-like scoring (TF-based since we don't have corpus IDF at query time)
   * @param text - Query text
   * @returns Sparse vector with indices and values
   */
  generateSparseEmbedding(text: string): SparseVector {
    const terms = this.tokenize(text);
    const termFrequency = this.calculateTermFrequency(terms);

    const indices: number[] = [];
    const values: number[] = [];

    for (const [term, tf] of termFrequency.entries()) {
      const termId = this.getOrCreateTermId(term);

      // Simplified TF scoring (no IDF available at query time)
      // Use log-scaled TF to avoid overweighting repeated terms
      const score = Math.log(1 + tf);

      if (score > 0) {
        indices.push(termId);
        values.push(score);
      }
    }

    // Sort by indices for consistency (required by Qdrant)
    const sorted = indices
      .map((idx, i) => ({ idx, val: values[i] }))
      .sort((a, b) => a.idx - b.idx);

    return {
      indices: sorted.map((s) => s.idx),
      values: sorted.map((s) => s.val),
    };
  }

  /**
   * Tokenize text into terms (must match indexing service)
   * Identical to indexing service tokenization
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 2); // Filter out very short terms
  }

  /**
   * Calculate term frequency for a query
   */
  private calculateTermFrequency(terms: string[]): Map<string, number> {
    const tf = new Map<string, number>();

    for (const term of terms) {
      tf.set(term, (tf.get(term) || 0) + 1);
    }

    return tf;
  }

  /**
   * Get or create term ID in vocabulary
   * Must match indexing service's term ID generation strategy
   */
  private getOrCreateTermId(term: string): number {
    if (!this.vocabulary.has(term)) {
      this.vocabulary.set(term, this.vocabulary.size);
    }

    return this.vocabulary.get(term)!;
  }
}
