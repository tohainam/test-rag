import { Injectable, Logger } from '@nestjs/common';
import {
  ParentChunk,
  ChildChunk,
  ChunkLineage,
  ValidationResult,
} from '../types';
import { OrphanChildrenError, IncompleteLineageError } from '../errors';

/**
 * Lineage Validator Service
 * Validates parent-child lineage integrity
 */
@Injectable()
export class LineageValidatorService {
  private readonly logger = new Logger(LineageValidatorService.name);

  /**
   * Validate lineage records
   * @param parentChunks - Array of parent chunks
   * @param childChunks - Array of child chunks
   * @param lineageRecords - Array of lineage records
   * @returns Validation result
   * @throws OrphanChildrenError if orphan children detected
   * @throws IncompleteLineageError if lineage is incomplete
   */
  validate(
    parentChunks: ParentChunk[],
    childChunks: ChildChunk[],
    lineageRecords: ChunkLineage[],
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Check: Each child must have a parent
    const parentIds = new Set(parentChunks.map((p) => p.id));
    const orphanIds: string[] = [];

    for (const child of childChunks) {
      if (!parentIds.has(child.parentChunkId)) {
        errors.push(
          `Orphan child chunk: ${child.id} references non-existent parent ${child.parentChunkId}`,
        );
        orphanIds.push(child.id);
      }
    }

    if (orphanIds.length > 0) {
      throw new OrphanChildrenError(
        `Found ${orphanIds.length} orphan child chunks`,
        orphanIds,
      );
    }

    // 2. Check: Lineage record count matches children count
    if (lineageRecords.length !== childChunks.length) {
      errors.push(
        `Lineage record count (${lineageRecords.length}) != child count (${childChunks.length})`,
      );
    }

    // 3. Check: Each parent has at least one child
    const childrenByParent = new Map<string, number>();
    for (const child of childChunks) {
      childrenByParent.set(
        child.parentChunkId,
        (childrenByParent.get(child.parentChunkId) || 0) + 1,
      );
    }

    const missingParents: string[] = [];
    for (const parent of parentChunks) {
      const childCount = childrenByParent.get(parent.id) || 0;
      if (childCount === 0) {
        warnings.push(`Parent chunk ${parent.id} has no children`);
        missingParents.push(parent.id);
      }
    }

    if (missingParents.length > 0) {
      throw new IncompleteLineageError(
        `Found ${missingParents.length} parents without children`,
        missingParents,
      );
    }

    // 4. Check: Lineage integrity
    const lineageMap = new Map<string, ChunkLineage>();
    for (const lineage of lineageRecords) {
      if (lineageMap.has(lineage.childChunkId)) {
        errors.push(
          `Duplicate lineage for child chunk: ${lineage.childChunkId}`,
        );
      }
      lineageMap.set(lineage.childChunkId, lineage);
    }

    // 5. Check: Child chunks reference correct parents in lineage
    for (const child of childChunks) {
      const lineage = lineageMap.get(child.id);
      if (!lineage) {
        errors.push(`Child chunk ${child.id} missing lineage record`);
      } else if (lineage.parentChunkId !== child.parentChunkId) {
        errors.push(
          `Lineage mismatch for child ${child.id}: lineage parent=${lineage.parentChunkId}, chunk parent=${child.parentChunkId}`,
        );
      }
    }

    const isValid = errors.length === 0;

    if (isValid) {
      this.logger.log('Lineage validation passed successfully');
    } else {
      this.logger.error(
        `Lineage validation failed with ${errors.length} errors`,
      );
    }

    return {
      isValid,
      errors,
      warnings,
    };
  }

  /**
   * Validate token counts for chunks
   * Based on new strategy: 1800 parent / 512 child tokens
   * @param parentChunks - Array of parent chunks
   * @param childChunks - Array of child chunks
   * @returns Validation result
   */
  validateTokenCounts(
    parentChunks: ParentChunk[],
    childChunks: ChildChunk[],
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const WARNING_THRESHOLD = 10000; // Warn for very large parents
    const EMBEDDING_MAX_TOKENS = 8191; // Hard limit for children
    const REASONABLE_CHILD_MAX = 2000; // Warn if child > 2000 but < 8191

    // Parent validation - accept all sizes, warn if very large
    for (const parent of parentChunks) {
      if (parent.tokens > WARNING_THRESHOLD) {
        warnings.push(
          `Parent chunk ${parent.id} is very large: ${parent.tokens} tokens ` +
            `(warning threshold: ${WARNING_THRESHOLD}). ` +
            `This is acceptable since parent chunks don't need embedding.`,
        );
      }

      // Warn if parent is suspiciously small (might indicate issues)
      if (parent.tokens < 50) {
        warnings.push(
          `Parent chunk ${parent.id} is very small: ${parent.tokens} tokens`,
        );
      }
    }

    // Child validation - MUST enforce embedding limit
    for (const child of childChunks) {
      // ERROR: Child exceeds embedding model limit
      if (child.tokens > EMBEDDING_MAX_TOKENS) {
        errors.push(
          `Child chunk ${child.id} EXCEEDS EMBEDDING LIMIT: ${child.tokens} tokens > ${EMBEDDING_MAX_TOKENS}. ` +
            `This chunk CANNOT be embedded and will cause failures!`,
        );
      }
      // Warn: Child is large but within limit
      else if (child.tokens > REASONABLE_CHILD_MAX) {
        warnings.push(
          `Child chunk ${child.id} is large: ${child.tokens} tokens ` +
            `(reasonable max: ${REASONABLE_CHILD_MAX}, hard limit: ${EMBEDDING_MAX_TOKENS})`,
        );
      }
      // Warn: Child is very small
      else if (child.tokens < 50) {
        warnings.push(
          `Child chunk ${child.id} is very small: ${child.tokens} tokens`,
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
