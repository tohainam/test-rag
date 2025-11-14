/**
 * Content Normalizer Service
 * Based on specs from docs/plans/parse-stage.md - Section: ĐC-2: Document Parsing
 *
 * Normalizes content: line endings, encoding, whitespace
 */

import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';

/**
 * Content Normalizer Service
 */
@Injectable()
export class ContentNormalizerService {
  private readonly logger = new Logger(ContentNormalizerService.name);

  /**
   * Normalize content in documents
   *
   * @param documents - Documents to normalize
   * @returns Documents with normalized content
   */
  normalizeDocuments(documents: Document[]): Document[] {
    this.logger.log(`Normalizing ${documents.length} documents`);

    return documents.map((doc) => ({
      ...doc,
      pageContent: this.normalizeContent(doc.pageContent),
    }));
  }

  /**
   * Normalize text content
   *
   * Steps:
   * 1. Normalize line endings (CRLF → LF)
   * 2. Remove excessive whitespace (preserve structure)
   * 3. Trim trailing whitespace per line
   * 4. Trim leading/trailing whitespace
   *
   * @param content - Content to normalize
   * @returns Normalized content
   */
  normalizeContent(content: string): string {
    if (!content || content.length === 0) {
      return content;
    }

    let normalized = content;

    // Step 1: Normalize line endings (CRLF → LF, CR → LF)
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Step 2: Multiple spaces → single space (but preserve structure)
    // Replace multiple spaces/tabs with single space
    normalized = normalized.replace(/[ \t]+/g, ' ');

    // Step 3: Multiple newlines → double newline (preserve paragraph breaks)
    normalized = normalized.replace(/\n{3,}/g, '\n\n');

    // Step 4: Trim trailing whitespace per line
    normalized = normalized
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n');

    // Step 5: Trim overall content
    normalized = normalized.trim();

    return normalized;
  }

  /**
   * Remove control characters from content
   * (except newlines and tabs)
   *
   * @param content - Content to clean
   * @returns Cleaned content
   */
  removeControlCharacters(content: string): string {
    // Remove control characters except \n (newline) and \t (tab)
    // Control characters are in range 0x00-0x1F and 0x7F
    // eslint-disable-next-line no-control-regex
    return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  /**
   * Normalize whitespace in content
   * More aggressive than normalizeContent
   *
   * @param content - Content to normalize
   * @returns Normalized content
   */
  normalizeWhitespace(content: string): string {
    return content
      .replace(/\s+/g, ' ') // All whitespace → single space
      .trim();
  }

  /**
   * Preserve structure while normalizing
   * Keeps paragraph breaks and list structures
   *
   * @param content - Content to normalize
   * @returns Normalized content
   */
  normalizePreservingStructure(content: string): string {
    return content
      .split('\n\n') // Split into paragraphs
      .map((paragraph) => {
        // Normalize within each paragraph
        return paragraph
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join(' ');
      })
      .filter((paragraph) => paragraph.length > 0)
      .join('\n\n');
  }

  /**
   * Calculate content statistics
   *
   * @param content - Content to analyze
   * @returns Statistics object
   */
  calculateStatistics(content: string): {
    characterCount: number;
    wordCount: number;
    lineCount: number;
    paragraphCount: number;
  } {
    return {
      characterCount: content.length,
      wordCount: this.countWords(content),
      lineCount: content.split('\n').length,
      paragraphCount: content.split('\n\n').filter((p) => p.trim().length > 0)
        .length,
    };
  }

  /**
   * Count words in text
   *
   * @param text - Text to count words in
   * @returns Word count
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter((word) => word.length > 0).length;
  }
}
