/**
 * Sentence Boundary Detector
 * Based on specs from docs/plans/structure-stage.md - Section: ĐC-3
 *
 * Detects sentence boundaries (period + capital letter)
 * Strength: WEAK
 */

import { Injectable, Logger } from '@nestjs/common';
import { Boundary } from '../types';

@Injectable()
export class SentenceBoundaryDetector {
  private readonly logger = new Logger(SentenceBoundaryDetector.name);

  // Pattern: ". " followed by capital letter or number
  private readonly sentenceRegex = /\.\s+(?=[A-Z0-9])/g;

  /**
   * Detect sentence boundaries in text
   *
   * @param text - Full text content
   * @returns Array of sentence boundaries
   */
  detect(text: string): Boundary[] {
    const boundaries: Boundary[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.sentenceRegex.lastIndex = 0;

    while ((match = this.sentenceRegex.exec(text)) !== null) {
      boundaries.push({
        type: 'sentence',
        offset: match.index + 1, // After the period
        strength: 'weak',
      });
    }

    this.logger.log(
      `Detected ${boundaries.length} sentence boundaries in ${text.length} chars`,
    );

    return boundaries;
  }
}
