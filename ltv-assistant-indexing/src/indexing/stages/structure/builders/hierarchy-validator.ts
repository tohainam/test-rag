/**
 * Hierarchy Validator
 * Based on specs from docs/plans/structure-stage.md - Section: ĐC-2
 *
 * Validates and auto-corrects document hierarchy
 * Example: H1 → H3 → H2 becomes H1 → H2 → H3
 */

import { Injectable, Logger } from '@nestjs/common';
import { DocumentNode } from '../types';

@Injectable()
export class HierarchyValidator {
  private readonly logger = new Logger(HierarchyValidator.name);

  /**
   * Validate and auto-correct document hierarchy
   *
   * @param root - Root document node
   * @returns Validation warnings (empty if no issues)
   */
  validateAndCorrect(root: DocumentNode): string[] {
    const warnings: string[] = [];

    this.traverse(root, 0, warnings);

    if (warnings.length > 0) {
      this.logger.warn(
        `Auto-corrected ${warnings.length} hierarchy issues:\n${warnings.join('\n')}`,
      );
    } else {
      this.logger.log('Document hierarchy is valid');
    }

    return warnings;
  }

  /**
   * Traverse tree and correct invalid levels
   *
   * @param node - Current node
   * @param expectedLevel - Expected level based on parent
   * @param warnings - Warnings array to append to
   */
  private traverse(
    node: DocumentNode,
    expectedLevel: number,
    warnings: string[],
  ): void {
    // Correct level if needed
    if (node.level > expectedLevel + 1) {
      const originalLevel = node.level;
      node.level = expectedLevel + 1;

      const warning =
        `Invalid hierarchy: "${node.title}" (level ${originalLevel}) ` +
        `should be level ${expectedLevel + 1}. Auto-corrected.`;

      warnings.push(warning);
      this.logger.log(warning);
    }

    // Traverse children
    for (const child of node.children) {
      this.traverse(child, node.level, warnings);
    }
  }

  /**
   * Check if hierarchy is valid (without correction)
   *
   * @param root - Root document node
   * @returns True if valid
   */
  isValid(root: DocumentNode): boolean {
    return this.checkValidity(root, 0);
  }

  /**
   * Recursively check hierarchy validity
   *
   * @param node - Current node
   * @param parentLevel - Parent's level
   * @returns True if valid
   */
  private checkValidity(node: DocumentNode, parentLevel: number): boolean {
    // Check if level is at most parent + 1
    if (node.level > parentLevel + 1) {
      return false;
    }

    // Check children
    for (const child of node.children) {
      if (!this.checkValidity(child, node.level)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Detect orphan nodes (nodes without proper parent)
   *
   * @param root - Root document node
   * @returns Orphan node IDs
   */
  detectOrphans(root: DocumentNode): string[] {
    const orphans: string[] = [];
    this.findOrphans(root, orphans);
    return orphans;
  }

  /**
   * Find orphan nodes recursively
   *
   * @param node - Current node
   * @param orphans - Orphans array
   */
  private findOrphans(node: DocumentNode, orphans: string[]): void {
    // Check if node has children but invalid structure
    if (node.children.length === 0) {
      return;
    }

    for (const child of node.children) {
      // Check if child level is valid relative to parent
      if (child.level <= node.level) {
        orphans.push(child.id);
        this.logger.warn(
          `Orphan detected: "${child.title}" (level ${child.level}) ` +
            `under parent "${node.title}" (level ${node.level})`,
        );
      }

      // Recurse
      this.findOrphans(child, orphans);
    }
  }
}
