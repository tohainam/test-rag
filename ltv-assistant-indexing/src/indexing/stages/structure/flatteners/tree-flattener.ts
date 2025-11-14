/**
 * Tree Flattener
 * Based on specs from docs/plans/structure-stage.md - Section: ĐC-4
 *
 * Converts hierarchical tree to flat list of sections for Chunk Stage
 */

import { Injectable, Logger } from '@nestjs/common';
import { AnnotatedDocumentNode, FlatSection } from '../types';

@Injectable()
export class TreeFlattener {
  private readonly logger = new Logger(TreeFlattener.name);

  /**
   * Flatten hierarchical tree to flat list of sections
   *
   * @param annotatedTree - Annotated document tree
   * @returns Flat array of sections
   */
  flatten(annotatedTree: AnnotatedDocumentNode): FlatSection[] {
    const sections: FlatSection[] = [];

    this.traverse(annotatedTree, sections);

    this.logger.log(
      `Flattened tree to ${sections.length} sections for Chunk Stage`,
    );

    return sections;
  }

  /**
   * Traverse tree and collect sections
   *
   * @param node - Current node
   * @param sections - Sections array to append to
   */
  private traverse(node: AnnotatedDocumentNode, sections: FlatSection[]): void {
    // Skip root document node, only collect sections
    if (node.type === 'section') {
      const flatSection: FlatSection = {
        id: node.id,
        title: node.title,
        level: node.level,
        content: node.content,
        sectionPath: node.metadata.sectionPath,
        boundaries: node.boundaries,
        metadata: node.metadata,
      };

      sections.push(flatSection);
    }

    // Traverse children in order
    for (const child of node.children) {
      this.traverse(child, sections);
    }
  }

  /**
   * Calculate statistics for flat sections
   *
   * @param sections - Flat sections
   * @returns Statistics
   */
  calculateStatistics(sections: FlatSection[]): {
    totalSections: number;
    averageWordCount: number;
    largestSectionId: string;
  } {
    const totalSections = sections.length;

    const totalWords = sections.reduce(
      (sum, section) => sum + section.metadata.wordCount,
      0,
    );

    const averageWordCount = totalSections > 0 ? totalWords / totalSections : 0;

    // Find largest section
    let largestSectionId = '';
    let maxWords = 0;

    for (const section of sections) {
      if (section.metadata.wordCount > maxWords) {
        maxWords = section.metadata.wordCount;
        largestSectionId = section.id;
      }
    }

    return {
      totalSections,
      averageWordCount: Math.round(averageWordCount),
      largestSectionId,
    };
  }
}
