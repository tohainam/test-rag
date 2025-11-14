/**
 * Boundary Annotator
 * Based on specs from docs/plans/structure-stage.md - Section: ĐC-3
 *
 * Annotates document tree with boundaries
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentNode,
  AnnotatedDocumentNode,
  Boundary,
  BoundaryStatistics,
} from '../types';
import { ParagraphBoundaryDetector } from './paragraph-boundary.detector';
import { SentenceBoundaryDetector } from './sentence-boundary.detector';

@Injectable()
export class BoundaryAnnotator {
  private readonly logger = new Logger(BoundaryAnnotator.name);

  constructor(
    private readonly paragraphDetector: ParagraphBoundaryDetector,
    private readonly sentenceDetector: SentenceBoundaryDetector,
  ) {}

  /**
   * Annotate document tree with boundaries
   *
   * @param documentTree - Original document tree
   * @param fullText - Full document text
   * @returns Annotated document tree
   */
  annotate(
    documentTree: DocumentNode,
    fullText: string,
  ): AnnotatedDocumentNode {
    // Detect all boundaries in full text
    const paragraphBoundaries = this.paragraphDetector.detect(fullText);
    const sentenceBoundaries = this.sentenceDetector.detect(fullText);

    this.logger.log(
      `Detected ${paragraphBoundaries.length} paragraph and ` +
        `${sentenceBoundaries.length} sentence boundaries`,
    );

    // Annotate tree recursively
    const annotatedTree = this.traverseAndAnnotate(
      documentTree,
      paragraphBoundaries,
      sentenceBoundaries,
    );

    return annotatedTree;
  }

  /**
   * Traverse tree and annotate each node with boundaries
   *
   * @param node - Current node
   * @param paragraphBoundaries - All paragraph boundaries
   * @param sentenceBoundaries - All sentence boundaries
   * @returns Annotated node
   */
  private traverseAndAnnotate(
    node: DocumentNode,
    paragraphBoundaries: Boundary[],
    sentenceBoundaries: Boundary[],
  ): AnnotatedDocumentNode {
    // Find boundaries within this node's range
    const nodeBoundaries = this.findBoundariesInRange(
      node.metadata.offsetStart,
      node.metadata.offsetEnd,
      paragraphBoundaries,
      sentenceBoundaries,
    );

    // Add section boundary at start (if section)
    if (node.type === 'section') {
      nodeBoundaries.unshift({
        type: 'section',
        offset: node.metadata.offsetStart,
        strength: 'strong',
      });
    }

    // Sort by offset
    nodeBoundaries.sort((a, b) => a.offset - b.offset);

    // Annotate children
    const annotatedChildren = node.children.map((child) =>
      this.traverseAndAnnotate(child, paragraphBoundaries, sentenceBoundaries),
    );

    return {
      ...node,
      boundaries: nodeBoundaries,
      children: annotatedChildren,
    };
  }

  /**
   * Find boundaries within a specific offset range
   *
   * @param start - Start offset
   * @param end - End offset
   * @param paragraphBoundaries - Paragraph boundaries
   * @param sentenceBoundaries - Sentence boundaries
   * @returns Boundaries in range
   */
  private findBoundariesInRange(
    start: number,
    end: number,
    paragraphBoundaries: Boundary[],
    sentenceBoundaries: Boundary[],
  ): Boundary[] {
    const boundaries: Boundary[] = [];

    // Filter paragraph boundaries
    for (const boundary of paragraphBoundaries) {
      if (boundary.offset >= start && boundary.offset < end) {
        boundaries.push(boundary);
      }
    }

    // Filter sentence boundaries
    for (const boundary of sentenceBoundaries) {
      if (boundary.offset >= start && boundary.offset < end) {
        boundaries.push(boundary);
      }
    }

    return boundaries;
  }

  /**
   * Calculate boundary statistics
   *
   * @param annotatedTree - Annotated tree
   * @returns Statistics
   */
  calculateStatistics(
    annotatedTree: AnnotatedDocumentNode,
  ): BoundaryStatistics {
    let totalSections = 0;
    let totalParagraphs = 0;
    let totalSentences = 0;

    const traverse = (node: AnnotatedDocumentNode): void => {
      for (const boundary of node.boundaries) {
        switch (boundary.type) {
          case 'section':
            totalSections++;
            break;
          case 'paragraph':
            totalParagraphs++;
            break;
          case 'sentence':
            totalSentences++;
            break;
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(annotatedTree);

    return {
      totalSections,
      totalParagraphs,
      totalSentences,
    };
  }
}
