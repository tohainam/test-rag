/**
 * DOCX Heading Detector
 * Based on specs from docs/plans/structure-stage.md - Section: ĐC-1
 *
 * Detects headings from DOCX style metadata
 * Confidence: HIGH
 *
 * Note: Requires Parse Stage to extract Word style information in metadata.
 * Current implementation uses pattern matching as fallback.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { Heading } from '../types';

@Injectable()
export class DocxHeadingDetector {
  private readonly logger = new Logger(DocxHeadingDetector.name);

  /**
   * Detect DOCX headings from documents with metadata
   *
   * @param documents - LangChain documents from Parse Stage
   * @returns Array of detected headings
   */
  detectFromDocuments(documents: Document[]): Heading[] {
    const headings: Heading[] = [];
    let currentOffset = 0;

    for (const doc of documents) {
      const content = doc.pageContent;

      // Check if document has style metadata
      const style = doc.metadata.style as string | undefined;

      if (style && /Heading \d+/.test(style)) {
        // Extract heading level from style
        const match = /Heading (\d+)/.exec(style);
        if (match) {
          const level = parseInt(match[1], 10);

          if (level >= 1 && level <= 6) {
            const title = content.trim();

            // Validate title length
            if (title.length > 0 && title.length <= 200) {
              headings.push({
                level,
                title,
                startOffset: currentOffset,
                endOffset: currentOffset + content.length,
                type: 'docx-style',
                metadata: { style },
              });
            }
          }
        }
      }

      currentOffset += content.length + 1; // +1 for newline
    }

    this.logger.log(
      `Detected ${headings.length} DOCX headings from style metadata`,
    );

    return headings;
  }

  /**
   * Detect DOCX headings from plain text (fallback)
   * Uses same heuristics as PDF detector
   *
   * @param text - Full document text
   * @returns Array of detected headings
   */
  detectFromText(text: string): Heading[] {
    const headings: Heading[] = [];
    const lines = text.split('\n');

    // Calculate average line length
    const avgLineLength =
      lines.reduce((sum, line) => sum + line.trim().length, 0) / lines.length;

    let currentOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (this.isLikelyHeading(trimmedLine, avgLineLength)) {
        const level = this.estimateLevel(trimmedLine);

        headings.push({
          level,
          title: trimmedLine,
          startOffset: currentOffset + line.indexOf(trimmedLine),
          endOffset:
            currentOffset + line.indexOf(trimmedLine) + trimmedLine.length,
          type: 'docx-style',
        });
      }

      currentOffset += line.length + 1; // +1 for newline
    }

    this.logger.log(
      `Detected ${headings.length} DOCX headings from text patterns`,
    );

    return headings;
  }

  /**
   * Check if line is likely a heading
   *
   * @param line - Line text
   * @param avgLineLength - Average line length
   * @returns True if likely heading
   */
  private isLikelyHeading(line: string, avgLineLength: number): boolean {
    if (line.length === 0 || line.length < 3 || line.length > 200) {
      return false;
    }

    // Shorter than average
    if (line.length > avgLineLength * 1.5) {
      return false;
    }

    // Starts with capital or number
    if (!/^[A-Z0-9]/.test(line)) {
      return false;
    }

    return true;
  }

  /**
   * Estimate heading level
   *
   * @param line - Line text
   * @returns Estimated level (1-6)
   */
  private estimateLevel(line: string): number {
    // Number prefix pattern
    const numberMatch = line.match(/^(\d+\.)+/);
    if (numberMatch) {
      const dotCount = (numberMatch[0].match(/\./g) || []).length;
      return Math.min(dotCount, 6);
    }

    // ALL CAPS
    if (line === line.toUpperCase()) {
      return 1;
    }

    // Length-based
    if (line.length < 30) return 2;
    if (line.length < 60) return 3;
    return 4;
  }
}
