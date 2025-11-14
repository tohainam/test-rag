/**
 * ALL CAPS Heading Detector
 * Based on specs from docs/plans/structure-stage.md - Section: ĐC-1
 *
 * Detects headings from ALL CAPS text patterns
 * Patterns: "CHAPTER 1: INTRODUCTION" or "1. INTRODUCTION"
 * Confidence: LOW
 */

import { Injectable, Logger } from '@nestjs/common';
import { Heading } from '../types';

@Injectable()
export class AllCapsHeadingDetector {
  private readonly logger = new Logger(AllCapsHeadingDetector.name);

  // Pattern: ALL CAPS text with optional numbers and punctuation
  private readonly allCapsHeadingRegex = /^([A-Z][A-Z\s0-9:.-]{2,})$/gm;

  /**
   * Detect ALL CAPS headings from text
   *
   * @param text - Full document text
   * @returns Array of detected headings
   */
  detect(text: string): Heading[] {
    const headings: Heading[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.allCapsHeadingRegex.lastIndex = 0;

    while ((match = this.allCapsHeadingRegex.exec(text)) !== null) {
      const title = match[1].trim();

      // Validate: must be shorter than 200 chars
      // (avoid detecting full caps paragraphs)
      if (title.length >= 200) {
        this.logger.log(
          `Skipping ALL CAPS text at offset ${match.index}: too long (${title.length} chars)`,
        );
        continue;
      }

      // Validate: must be at least 3 chars
      if (title.length < 3) {
        continue;
      }

      // Estimate level from text content
      const level = this.estimateLevelFromText(title);

      headings.push({
        level,
        title,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        type: 'all-caps',
      });
    }

    this.logger.log(
      `Detected ${headings.length} ALL CAPS headings from ${text.length} chars`,
    );

    return headings;
  }

  /**
   * Estimate heading level from text content
   *
   * @param title - Heading title
   * @returns Estimated level (1-6)
   */
  private estimateLevelFromText(title: string): number {
    // "CHAPTER" → Level 1
    if (/^CHAPTER\s+\d+/i.test(title)) {
      return 1;
    }

    // "SECTION" → Level 2
    if (/^SECTION\s+\d+/i.test(title)) {
      return 2;
    }

    // "PART" → Level 1
    if (/^PART\s+\d+/i.test(title)) {
      return 1;
    }

    // Numbered patterns with dash: "IDX-01", "RTV-01", "ABC-123" → Level 1
    // These are typically top-level section identifiers
    if (/^[A-Z]{2,}-\d+/i.test(title)) {
      return 1;
    }

    // Number pattern with dots: "1.1", "2.3.4" → Level based on dots
    const dotCount = (title.match(/\./g) || []).length;
    if (dotCount > 0) {
      return Math.min(dotCount + 1, 6);
    }

    // Simple numbered pattern: "1. INTRODUCTION", "2 OVERVIEW" → Level 1
    if (/^\d+[\s.:)-]/.test(title)) {
      return 1;
    }

    // Default to level 1 for other ALL CAPS (likely top-level headings)
    // Note: Changed from level 2 to level 1 because most ALL CAPS text
    // in documents represents major section headings
    return 1;
  }

  /**
   * Check if text contains ALL CAPS headings
   *
   * @param text - Text to check
   * @returns True if ALL CAPS headings found
   */
  hasAllCapsHeadings(text: string): boolean {
    this.allCapsHeadingRegex.lastIndex = 0;
    return this.allCapsHeadingRegex.test(text);
  }
}
