/**
 * Tree Constructor
 * Based on specs from docs/plans/structure-stage.md - Section: ĐC-2
 *
 * Builds hierarchical document tree from headings using stack algorithm
 */

import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { Heading, DocumentNode, TreeStatistics } from '../types';

@Injectable()
export class TreeConstructor {
  private readonly logger = new Logger(TreeConstructor.name);

  /**
   * Build document tree from headings
   *
   * @param headings - Detected headings
   * @param documents - Original documents
   * @param fileId - File identifier
   * @param filename - Filename
   * @returns Document tree root node
   */
  buildTree(
    headings: Heading[],
    documents: Document[],
    fileId: string,
    filename: string,
  ): DocumentNode {
    const fullText = documents.map((d) => d.pageContent).join('\n\n');

    // Create root node
    const root: DocumentNode = {
      id: fileId,
      type: 'document',
      title: filename,
      level: 0,
      content: '',
      children: [],
      metadata: {
        sectionPath: filename,
        offsetStart: 0,
        offsetEnd: fullText.length,
        wordCount: 0,
      },
    };

    // If no headings, return root with full content
    if (headings.length === 0) {
      return root;
    }

    // Build tree using stack algorithm
    this.buildTreeWithStack(root, headings, fullText);

    this.logger.log(
      `Built document tree with ${this.countNodes(root)} total nodes`,
    );

    return root;
  }

  /**
   * Build tree using stack algorithm
   * Based on PRD Section: ĐC-2 - Tree Construction
   *
   * @param root - Root node
   * @param headings - Headings array
   * @param fullText - Full document text
   */
  private buildTreeWithStack(
    root: DocumentNode,
    headings: Heading[],
    fullText: string,
  ): void {
    const stack: DocumentNode[] = [root];

    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const nextHeading = headings[i + 1];

      // Extract section content (from this heading to next)
      const startOffset = heading.startOffset;
      const endOffset = nextHeading ? nextHeading.startOffset : fullText.length;
      const content = fullText.slice(startOffset, endOffset).trim();

      // Create section node
      const section: DocumentNode = {
        id: `${root.id}_section_${i}`,
        type: 'section',
        title: heading.title,
        level: heading.level,
        content,
        children: [],
        metadata: {
          sectionPath: '', // Will be set by SectionPathGenerator
          offsetStart: startOffset,
          offsetEnd: endOffset,
          wordCount: this.countWords(content),
        },
      };

      // Find correct parent using stack
      // Pop stack until we find a parent with level < current level
      while (
        stack.length > 0 &&
        stack[stack.length - 1].level >= heading.level
      ) {
        stack.pop();
      }

      // Add as child to current top of stack
      const parent = stack[stack.length - 1];
      parent.children.push(section);

      // Push current section onto stack
      stack.push(section);
    }
  }

  /**
   * Calculate tree statistics
   *
   * @param root - Root node
   * @returns Tree statistics
   */
  calculateStatistics(root: DocumentNode): TreeStatistics {
    let totalSections = 0;
    let totalDepth = 0;
    let maxDepth = 0;
    let nodeCount = 0;

    const traverse = (node: DocumentNode, depth: number): void => {
      if (node.type === 'section') {
        totalSections++;
        totalDepth += depth;
        nodeCount++;
        maxDepth = Math.max(maxDepth, depth);
      }

      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    };

    traverse(root, 0);

    return {
      totalSections,
      maxDepth,
      averageDepth: nodeCount > 0 ? totalDepth / nodeCount : 0,
    };
  }

  /**
   * Count total nodes in tree
   *
   * @param root - Root node
   * @returns Node count
   */
  private countNodes(root: DocumentNode): number {
    let count = 1; // Count root

    for (const child of root.children) {
      count += this.countNodes(child);
    }

    return count;
  }

  /**
   * Count words in text
   *
   * @param text - Text content
   * @returns Word count
   */
  private countWords(text: string): number {
    // Simple word count: split by whitespace and filter empty strings
    return text.split(/\s+/).filter((word) => word.length > 0).length;
  }
}
