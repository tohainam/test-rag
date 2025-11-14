/**
 * Sparse Embedding Service
 * BM25 Algorithm for Keyword-based Retrieval
 */

import { Injectable, Logger } from '@nestjs/common';
import type { SparseVector } from './types';

@Injectable()
export class SparseEmbeddingService {
  private readonly logger = new Logger(SparseEmbeddingService.name);

  // BM25 parameters
  private readonly k1 = 1.5; // Term frequency saturation parameter
  private readonly b = 0.75; // Length normalization parameter

  // Vocabulary management
  private vocabulary: Map<string, number> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private totalDocuments = 0;
  private avgDocLength = 0;

  /**
   * Generate sparse embedding using BM25
   */
  generateSparseEmbedding(text: string): SparseVector {
    const terms = this.tokenize(text);
    const termFrequency = this.calculateTermFrequency(terms);
    const docLength = terms.length;

    const indices: number[] = [];
    const values: number[] = [];

    for (const [term, tf] of termFrequency.entries()) {
      const termId = this.getOrCreateTermId(term);
      const idf = this.calculateIDF(term);

      // BM25 formula
      const numerator = tf * (this.k1 + 1);
      const denominator =
        tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
      const score = idf * (numerator / denominator);

      if (score > 0) {
        indices.push(termId);
        values.push(score);
      }
    }

    // Sort by indices for consistency
    const sorted = indices
      .map((idx, i) => ({ idx, val: values[i] }))
      .sort((a, b) => a.idx - b.idx);

    return {
      indices: sorted.map((s) => s.idx),
      values: sorted.map((s) => s.val),
    };
  }

  /**
   * Update vocabulary with new documents
   */
  updateVocabulary(texts: string[]): void {
    this.totalDocuments += texts.length;

    let totalLength = 0;
    for (const text of texts) {
      const terms = this.tokenize(text);
      totalLength += terms.length;

      const uniqueTerms = new Set(terms);
      for (const term of uniqueTerms) {
        this.documentFrequency.set(
          term,
          (this.documentFrequency.get(term) || 0) + 1,
        );
      }
    }

    this.avgDocLength = totalLength / texts.length;

    this.logger.log(
      `Updated BM25 corpus: ${this.documentFrequency.size} unique terms, ` +
        `${this.totalDocuments} docs, avg length: ${this.avgDocLength.toFixed(1)} tokens`,
    );
  }

  /**
   * Tokenize text into terms
   */
  private tokenize(text: string): string[] {
    // Lowercase and split by whitespace/punctuation
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 2); // Filter out very short terms
  }

  /**
   * Calculate term frequency for a document
   */
  private calculateTermFrequency(terms: string[]): Map<string, number> {
    const tf = new Map<string, number>();

    for (const term of terms) {
      tf.set(term, (tf.get(term) || 0) + 1);
    }

    return tf;
  }

  /**
   * Calculate IDF (Inverse Document Frequency)
   */
  private calculateIDF(term: string): number {
    const df = this.documentFrequency.get(term) || 0;

    if (df === 0) {
      return 0;
    }

    // IDF formula: log((N - df + 0.5) / (df + 0.5) + 1)
    return Math.log((this.totalDocuments - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * Get or create term ID in vocabulary
   */
  private getOrCreateTermId(term: string): number {
    if (!this.vocabulary.has(term)) {
      this.vocabulary.set(term, this.vocabulary.size);
    }

    return this.vocabulary.get(term)!;
  }

  /**
   * Get BM25 statistics
   */
  getVocabularyStats(): {
    vocabularySize: number;
    uniqueTermsInCorpus: number;
    totalDocuments: number;
    avgDocLength: number;
  } {
    return {
      vocabularySize: this.vocabulary.size, // Vocabulary built during embedding generation
      uniqueTermsInCorpus: this.documentFrequency.size, // Terms seen during corpus update
      totalDocuments: this.totalDocuments,
      avgDocLength: this.avgDocLength,
    };
  }

  /**
   * Reset BM25 corpus (for testing or reindexing)
   */
  resetVocabulary(): void {
    this.vocabulary.clear();
    this.documentFrequency.clear();
    this.totalDocuments = 0;
    this.avgDocLength = 0;

    this.logger.log('BM25 corpus reset');
  }
}
