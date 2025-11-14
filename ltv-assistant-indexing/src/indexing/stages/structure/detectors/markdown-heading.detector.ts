/**
 * Markdown Heading Detector
 * Based on specs from docs/plans/structure-stage.md - Section: ĐC-1
 *
 * Detects headings from Markdown syntax: ## Heading Text
 * Confidence: HIGH
 */

import { Injectable, Logger } from '@nestjs/common';
import { Heading } from '../types';

@Injectable()
export class MarkdownHeadingDetector {
  private readonly logger = new Logger(MarkdownHeadingDetector.name);

  // Pattern: ## Heading Text
  private readonly markdownHeadingRegex = /^(#{1,6})\s+(.+)$/gm;

  /**
   * Detect Markdown headings from text
   *
   * @param text - Full document text
   * @returns Array of detected headings
   */
  detect(text: string): Heading[] {
    const headings: Heading[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.markdownHeadingRegex.lastIndex = 0;

    while ((match = this.markdownHeadingRegex.exec(text)) !== null) {
      const level = match[1].length; // Count # symbols
      const title = match[2].trim();
      const offset = match.index;

      // Validate title length (1-200 chars as per PRD)
      if (title.length === 0 || title.length > 200) {
        this.logger.log(
          `Skipping invalid heading at offset ${offset}: title length ${title.length}`,
        );
        continue;
      }

      headings.push({
        level,
        title,
        startOffset: offset,
        endOffset: offset + match[0].length,
        type: 'markdown',
      });
    }

    this.logger.log(
      `Detected ${headings.length} Markdown headings from ${text.length} chars`,
    );

    return headings;
  }

  /**
   * Check if text contains Markdown headings
   *
   * @param text - Text to check
   * @returns True if Markdown headings found
   */
  hasMarkdownHeadings(text: string): boolean {
    this.markdownHeadingRegex.lastIndex = 0;
    return this.markdownHeadingRegex.test(text);
  }
}
