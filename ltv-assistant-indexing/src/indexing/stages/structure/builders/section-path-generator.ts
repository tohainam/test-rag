/**
 * Section Path Generator
 * Based on specs from docs/plans/structure-stage.md - Section: YN-3
 *
 * Generates breadcrumb paths for sections
 * Format: "Root > Section 1 > Subsection 1.1"
 */

import { Injectable, Logger } from '@nestjs/common';
import { DocumentNode } from '../types';

@Injectable()
export class SectionPathGenerator {
  private readonly logger = new Logger(SectionPathGenerator.name);

  // Maximum path length as per PRD
  private readonly MAX_PATH_LENGTH = 200;

  /**
   * Generate section paths for entire tree
   *
   * @param root - Root document node
   */
  generatePaths(root: DocumentNode): void {
    this.traverse(root, '');
    this.logger.log('Generated section paths for document tree');
  }

  /**
   * Traverse tree and generate paths recursively
   *
   * @param node - Current node
   * @param parentPath - Parent's path
   */
  private traverse(node: DocumentNode, parentPath: string): void {
    // Generate path for current node
    node.metadata.sectionPath = parentPath
      ? `${parentPath} > ${node.title}`
      : node.title;

    // Truncate if exceeds max length
    if (node.metadata.sectionPath.length > this.MAX_PATH_LENGTH) {
      node.metadata.sectionPath = this.truncatePath(
        node.metadata.sectionPath,
        this.MAX_PATH_LENGTH,
      );
    }

    // Traverse children
    for (const child of node.children) {
      this.traverse(child, node.metadata.sectionPath);
    }
  }

  /**
   * Truncate path to max length while preserving readability
   *
   * @param path - Original path
   * @param maxLength - Maximum length
   * @returns Truncated path
   */
  private truncatePath(path: string, maxLength: number): string {
    if (path.length <= maxLength) {
      return path;
    }

    // Try to truncate at last separator
    const separator = ' > ';
    const parts = path.split(separator);

    // Keep first and last parts, truncate middle
    if (parts.length > 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      const truncated = `${first} > ... > ${last}`;

      if (truncated.length <= maxLength) {
        return truncated;
      }
    }

    // Fallback: hard truncate with ellipsis
    return path.slice(0, maxLength - 3) + '...';
  }

  /**
   * Generate numbered paths (auto-numbering)
   * Example: "1", "1.1", "1.2", "2", "2.1"
   *
   * @param root - Root document node
   */
  generateNumberedPaths(root: DocumentNode): void {
    this.traverseWithNumbers(root, []);
    this.logger.log('Generated numbered section paths');
  }

  /**
   * Traverse with auto-numbering
   *
   * @param node - Current node
   * @param parentNumbers - Parent's number sequence
   */
  private traverseWithNumbers(
    node: DocumentNode,
    parentNumbers: number[],
  ): void {
    // Generate number for current node
    const currentNumbers = [...parentNumbers];

    // For each child, assign sequential number
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const childNumbers = [...currentNumbers, i + 1];
      const numberString = childNumbers.join('.');

      // Prepend number to title if not already numbered
      if (!/^\d+\./.test(child.title)) {
        child.title = `${numberString} ${child.title}`;
      }

      // Update path with numbered title
      child.metadata.sectionPath = node.metadata.sectionPath
        ? `${node.metadata.sectionPath} > ${child.title}`
        : child.title;

      // Recurse
      this.traverseWithNumbers(child, childNumbers);
    }
  }
}
