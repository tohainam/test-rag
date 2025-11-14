/**
 * PDF Heading Detector
 * Based on specs from docs/plans/structure-stage.md - Section: ĐC-1
 *
 * Detects headings from PDF formatting (bold + larger font size)
 * Confidence: MEDIUM
 *
 * Note: This is a simplified version that works with plain text.
 * For full PDF metadata support, Parse Stage would need to extract font info.
 * Current implementation uses heuristics on plain text.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Heading } from '../types';

@Injectable()
export class PdfHeadingDetector {
  private readonly logger = new Logger(PdfHeadingDetector.name);

  /**
   * Detect PDF headings from text
   *
   * Note: Without actual font metadata from Parse Stage,
   * this implementation uses text-based heuristics:
   * - Lines that are shorter than average (likely headings)
   * - Lines followed by blank lines
   * - Lines with title-case or ALL CAPS
   *
   * @param text - Full document text
   * @returns Array of detected headings
   */
  detect(text: string): Heading[] {
    const headings: Heading[] = [];
    const lines = text.split('\n');

    // Calculate average line length
    const avgLineLength =
      lines.reduce((sum, line) => sum + line.trim().length, 0) / lines.length;

    let currentOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check if line might be a heading
      if (this.isLikelyHeading(trimmedLine, avgLineLength, lines, i)) {
        const level = this.estimateLevel(trimmedLine);

        headings.push({
          level,
          title: trimmedLine,
          startOffset: currentOffset + line.indexOf(trimmedLine),
          endOffset:
            currentOffset + line.indexOf(trimmedLine) + trimmedLine.length,
          type: 'pdf-bold-size',
        });
      }

      currentOffset += line.length + 1; // +1 for newline
    }

    this.logger.log(
      `Detected ${headings.length} PDF-style headings using heuristics`,
    );

    return headings;
  }

  /**
   * Check if line is likely a heading based on heuristics
   *
   * @param line - Line text
   * @param avgLineLength - Average line length
   * @param lines - All lines
   * @param index - Current line index
   * @returns True if likely heading
   */
  private isLikelyHeading(
    line: string,
    avgLineLength: number,
    lines: string[],
    index: number,
  ): boolean {
    // Must be non-empty
    if (line.length === 0) {
      return false;
    }

    // Must be between 3 and 200 chars
    if (line.length < 3 || line.length > 200) {
      return false;
    }

    // Heading heuristics:
    // 1. Shorter than average (not a full paragraph)
    if (line.length > avgLineLength * 1.5) {
      return false;
    }

    // 2. Followed by blank line or another short line
    const nextLine = lines[index + 1];
    if (
      nextLine &&
      nextLine.trim().length > 0 &&
      nextLine.trim().length > avgLineLength
    ) {
      return false;
    }

    // 3. Starts with capital letter or number
    if (!/^[A-Z0-9]/.test(line)) {
      return false;
    }

    // 4. Doesn't end with sentence-ending punctuation (headings usually don't)
    // Exception: "1.1. Introduction" style headings
    if (/[.!?]$/.test(line) && !/^\d+\./.test(line)) {
      return false;
    }

    return true;
  }

  /**
   * Estimate heading level from text characteristics
   *
   * @param line - Line text
   * @returns Estimated level (1-6)
   */
  private estimateLevel(line: string): number {
    // ALL CAPS → likely more important (level 1-2)
    if (line === line.toUpperCase()) {
      // Check for keywords
      if (/^(CHAPTER|PART)/i.test(line)) {
        return 1;
      }
      return 2;
    }

    // Number prefix: "1." → level 1, "1.1" → level 2, etc.
    const numberMatch = line.match(/^(\d+\.)+/);
    if (numberMatch) {
      const dotCount = (numberMatch[0].match(/\./g) || []).length;
      return Math.min(dotCount, 6);
    }

    // Very short → likely higher level
    if (line.length < 30) {
      return 2;
    }

    // Medium length → mid-level
    if (line.length < 60) {
      return 3;
    }

    // Longer → lower level
    return 4;
  }
}
