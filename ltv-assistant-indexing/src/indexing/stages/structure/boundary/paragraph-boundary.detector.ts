/**
 * Paragraph Boundary Detector
 * Based on specs from docs/plans/structure-stage.md - Section: ĐC-3
 *
 * Detects paragraph boundaries (double newlines)
 * Strength: MEDIUM
 */

import { Injectable, Logger } from '@nestjs/common';
import { Boundary } from '../types';

@Injectable()
export class ParagraphBoundaryDetector {
  private readonly logger = new Logger(ParagraphBoundaryDetector.name);

  // Pattern: Double newline (or more)
  private readonly paragraphRegex = /\n\n+/g;

  /**
   * Detect paragraph boundaries in text
   *
   * @param text - Full text content
   * @returns Array of paragraph boundaries
   */
  detect(text: string): Boundary[] {
    const boundaries: Boundary[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.paragraphRegex.lastIndex = 0;

    while ((match = this.paragraphRegex.exec(text)) !== null) {
      boundaries.push({
        type: 'paragraph',
        offset: match.index,
        strength: 'medium',
      });
    }

    this.logger.log(
      `Detected ${boundaries.length} paragraph boundaries in ${text.length} chars`,
    );

    return boundaries;
  }
}
