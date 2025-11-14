/**
 * Keyword Extractor Service
 * Extracts keywords using TF-IDF (algorithmic, no LLM)
 * Based on specs from docs/plans/enrich-stage.md - ĐC-3
 */

import { Injectable, Logger } from '@nestjs/common';
import * as natural from 'natural';
import type { EnrichedParentChunk } from '../types';

@Injectable()
export class KeywordExtractorService {
  private readonly logger = new Logger(KeywordExtractorService.name);
  private readonly TOP_K = 10;

  /**
   * Extract keywords for all parent chunks using TF-IDF
   * @param chunks - Array of enriched parent chunks
   * @returns Map of chunk ID to keywords array
   */
  extractKeywords(chunks: EnrichedParentChunk[]): Map<string, string[]> {
    try {
      const keywordsMap = new Map<string, string[]>();

      if (chunks.length === 0) {
        return keywordsMap;
      }

      // Initialize TF-IDF
      const TfIdf = natural.TfIdf;
      const tfidf = new TfIdf();

      // Add all chunks to corpus
      chunks.forEach((chunk) => {
        tfidf.addDocument(this.preprocessText(chunk.content));
      });

      // Extract keywords for each chunk
      chunks.forEach((chunk, index) => {
        const keywords: string[] = [];

        const terms = tfidf.listTerms(index);

        // Get top K terms
        terms.slice(0, this.TOP_K).forEach((item) => {
          keywords.push(item.term);
        });

        keywordsMap.set(chunk.id, keywords);
      });

      this.logger.log(
        `Extracted keywords for ${chunks.length} chunks using TF-IDF`,
      );

      return keywordsMap;
    } catch (error) {
      this.logger.error('Keyword extraction failed:', error);
      return new Map(); // Graceful degradation
    }
  }

  /**
   * Extract keywords for a single chunk
   * @param chunk - Enriched parent chunk
   * @param allChunks - All chunks in the document (for TF-IDF corpus)
   * @param topK - Number of keywords to extract (default: 10)
   * @returns Array of keywords
   */
  extractKeywordsForChunk(
    chunk: EnrichedParentChunk,
    allChunks: EnrichedParentChunk[],
    topK: number = this.TOP_K,
  ): string[] {
    try {
      const TfIdf = natural.TfIdf;
      const tfidf = new TfIdf();

      // Add all chunks to corpus
      allChunks.forEach((c) => {
        tfidf.addDocument(this.preprocessText(c.content));
      });

      // Find the index of the target chunk
      const targetIndex = allChunks.findIndex((c) => c.id === chunk.id);

      if (targetIndex === -1) {
        this.logger.warn(`Chunk ${chunk.id} not found in corpus`);
        return [];
      }

      // Extract keywords for target chunk
      const keywords: string[] = [];
      const terms = tfidf.listTerms(targetIndex);

      terms.slice(0, topK).forEach((item) => {
        keywords.push(item.term);
      });

      return keywords;
    } catch (error) {
      this.logger.error(
        `Keyword extraction failed for chunk ${chunk.id}:`,
        error,
      );
      return []; // Graceful degradation
    }
  }

  /**
   * Preprocess text for TF-IDF
   * - Lowercase
   * - Remove punctuation
   * - Normalize whitespace
   */
  private preprocessText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Get common keywords across all chunks
   * Useful for document-level summaries
   */
  getCommonKeywords(
    chunks: EnrichedParentChunk[],
    topN: number = 20,
  ): string[] {
    try {
      if (chunks.length === 0) {
        return [];
      }

      const TfIdf = natural.TfIdf;
      const tfidf = new TfIdf();

      // Combine all chunks into one document
      const combinedText = chunks.map((c) => c.content).join(' ');
      tfidf.addDocument(this.preprocessText(combinedText));

      // Extract top keywords
      const keywords: string[] = [];
      const terms = tfidf.listTerms(0);

      terms.slice(0, topN).forEach((item) => {
        keywords.push(item.term);
      });

      return keywords;
    } catch (error) {
      this.logger.error('Common keyword extraction failed:', error);
      return [];
    }
  }
}
