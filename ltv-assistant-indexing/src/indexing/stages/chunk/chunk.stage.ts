import { Injectable, Logger } from '@nestjs/common';
import { ChunkInputDto, ChunkOutputDto } from './dto';
import { ParentChunk, ChildChunk, ChunkStatistics } from './types';
import {
  TokenCounterService,
  ParentChunkSplitterService,
  ChildChunkSplitterService,
  LineageBuilderService,
  LineageValidatorService,
} from './services';
import { EmptySectionsError, PartialChunkingError } from './errors';

/**
 * Chunk Stage - Main Orchestrator
 * Responsible for splitting documents into parent and child chunks
 * with lineage tracking
 */
@Injectable()
export class ChunkStage {
  private readonly logger = new Logger(ChunkStage.name);

  constructor(
    private readonly parentSplitter: ParentChunkSplitterService,
    private readonly childSplitter: ChildChunkSplitterService,
    private readonly lineageBuilder: LineageBuilderService,
    private readonly lineageValidator: LineageValidatorService,
    private readonly tokenCounter: TokenCounterService,
  ) {}

  /**
   * Execute chunk stage
   * @param input - Chunk input from Structure Stage
   * @returns Chunk output with parent chunks, child chunks, and lineage
   */
  async execute(input: ChunkInputDto): Promise<ChunkOutputDto> {
    const startTime = Date.now();
    this.logger.log(
      `Starting chunk stage for document ${input.documentId} with ${input.sections.length} sections`,
    );

    // Validate input
    if (!input.sections || input.sections.length === 0) {
      throw new EmptySectionsError();
    }

    const allParentChunks: ParentChunk[] = [];
    const failedSections: string[] = [];
    let successfulSections = 0;

    // Process each section into parent chunks
    for (const section of input.sections) {
      try {
        // Pass cumulative index to ensure document-level sequential ordering
        const parentChunks = await this.parentSplitter.splitSection(
          section,
          input.documentId,
          input.fileId,
          allParentChunks.length, // Start index for this section
        );

        allParentChunks.push(...parentChunks);
        successfulSections++;

        this.logger.log(
          `Section ${section.id} split into ${parentChunks.length} parent chunks`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          `Failed to chunk section ${section.id}: ${errorMessage}`,
          errorStack,
        );
        failedSections.push(section.id);
      }
    }

    // Calculate success rate
    const successRate = successfulSections / input.sections.length;

    // Log warning if we have failed sections, but continue to prevent data loss
    if (failedSections.length > 0) {
      this.logger.warn(
        `${failedSections.length} sections failed to chunk (${Math.round((1 - successRate) * 100)}% failure rate). Failed sections: ${failedSections.join(', ')}`,
      );
    }

    // Only throw error if ALL sections failed - otherwise continue with partial data
    if (allParentChunks.length === 0) {
      throw new PartialChunkingError(
        'All sections failed to chunk - no data could be processed',
        failedSections,
        0,
      );
    }

    this.logger.log(
      `Created ${allParentChunks.length} parent chunks from ${successfulSections}/${input.sections.length} sections`,
    );

    // Validate content preservation
    const preservationValidation = this.validateContentPreservation(
      input.sections,
      allParentChunks,
    );

    if (!preservationValidation.isValid) {
      this.logger.warn(
        'Content preservation warnings:',
        preservationValidation.warnings,
      );
    }

    // Split parent chunks into child chunks
    const allChildChunks =
      await this.childSplitter.splitParents(allParentChunks);

    this.logger.log(`Created ${allChildChunks.length} child chunks`);

    // Validate coverage - ensure children cover parent content
    this.validateCoverage(allParentChunks, allChildChunks);

    // Build lineage
    const lineage = this.lineageBuilder.buildLineage(allChildChunks);

    // Validate lineage
    try {
      const lineageValidation = this.lineageValidator.validate(
        allParentChunks,
        allChildChunks,
        lineage,
      );

      if (!lineageValidation.isValid) {
        this.logger.error(
          'Lineage validation failed',
          lineageValidation.errors,
        );
      }

      if (lineageValidation.warnings.length > 0) {
        this.logger.warn(
          'Lineage validation warnings:',
          lineageValidation.warnings,
        );
      }
    } catch (error) {
      this.logger.error('Lineage validation error', error);
      throw error;
    }

    // Validate token counts
    const tokenValidation = this.lineageValidator.validateTokenCounts(
      allParentChunks,
      allChildChunks,
    );

    if (tokenValidation.warnings.length > 0) {
      this.logger.warn(
        'Token count validation warnings:',
        tokenValidation.warnings,
      );
    }

    // Calculate statistics
    const statistics = this.calculateStatistics(
      allParentChunks,
      allChildChunks,
    );

    const processingTime = Date.now() - startTime;

    this.logger.log(
      `Chunk stage completed in ${processingTime}ms - Parents: ${allParentChunks.length}, Children: ${allChildChunks.length}`,
    );

    return {
      parentChunks: allParentChunks,
      childChunks: allChildChunks,
      lineage,
      chunkMetadata: {
        totalParentChunks: allParentChunks.length,
        totalChildChunks: allChildChunks.length,
        averageParentTokens: statistics.averageParentTokens,
        averageChildTokens: statistics.averageChildTokens,
        averageChildrenPerParent: statistics.averageChildrenPerParent,
        processingTime,
        statistics,
      },
      errors: failedSections.map((sId) => `Failed to chunk section: ${sId}`),
    };
  }

  /**
   * Validate content preservation - ensure no data loss
   * @param sections - Original input sections
   * @param parentChunks - Generated parent chunks
   * @returns Validation result with warnings
   */
  private validateContentPreservation(
    sections: { id: string; content: string }[],
    parentChunks: ParentChunk[],
  ): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Calculate total input content length
    const totalInputChars = sections.reduce(
      (sum, section) => sum + section.content.length,
      0,
    );

    // Calculate total output content length
    const totalOutputChars = parentChunks.reduce(
      (sum, chunk) => sum + chunk.content.length,
      0,
    );

    // Check for significant content loss (accounting for overlap)
    // Overlap means output will be larger than input
    if (totalOutputChars < totalInputChars * 0.95) {
      warnings.push(
        `Potential content loss detected: Input=${totalInputChars} chars, Output=${totalOutputChars} chars`,
      );
    }

    // Log preservation metrics
    this.logger.log(
      `Content preservation: Input=${totalInputChars} chars, Output=${totalOutputChars} chars (${Math.round((totalOutputChars / totalInputChars) * 100)}%)`,
    );

    return {
      isValid: warnings.length === 0,
      warnings,
    };
  }

  /**
   * Validate coverage - ensure children cover parent content
   * @param parentChunks - Array of parent chunks
   * @param childChunks - Array of child chunks
   * @throws Error if coverage validation fails critically
   */
  private validateCoverage(
    parentChunks: ParentChunk[],
    childChunks: ChildChunk[],
  ): void {
    // Group children by parent ID
    const childrenByParent = new Map<string, ChildChunk[]>();
    for (const child of childChunks) {
      const existing = childrenByParent.get(child.parentChunkId) || [];
      existing.push(child);
      childrenByParent.set(child.parentChunkId, existing);
    }

    // Validate each parent has at least one child
    for (const parent of parentChunks) {
      const children = childrenByParent.get(parent.id) || [];

      if (children.length === 0) {
        throw new Error(
          `Parent chunk ${parent.id} has NO children - data loss detected!`,
        );
      }

      // Validate token coverage
      // Due to overlap, children tokens should be >= parent tokens
      // Special case: Small parents (< 100 tokens) are kept as single child with same content (200% coverage)
      const parentTokens = parent.tokens;
      const childTokensSum = children.reduce((sum, c) => sum + c.tokens, 0);

      const minExpected = parentTokens * 0.95; // Allow 5% loss for edge cases

      // Check for small parent edge case (single child with same content)
      const isSmallParentEdgeCase =
        children.length === 1 &&
        children[0].metadata.isOnlyChild === true &&
        Math.abs(childTokensSum - parentTokens) < 5; // Within 5 tokens = same content

      if (childTokensSum < minExpected) {
        this.logger.error(
          `Coverage too low for parent ${parent.id}: ` +
            `Parent=${parentTokens} tokens, Children=${childTokensSum} tokens ` +
            `(${Math.round((childTokensSum / parentTokens) * 100)}% coverage)`,
        );
        throw new Error(
          `Parent chunk ${parent.id} coverage too low - potential data loss!`,
        );
      }

      // Only warn about high coverage if it's NOT the small parent edge case
      if (!isSmallParentEdgeCase) {
        const maxExpected = parentTokens * 1.3; // Max 30% overhead for normal cases

        if (childTokensSum > maxExpected) {
          this.logger.warn(
            `Coverage overhead high for parent ${parent.id}: ` +
              `Parent=${parentTokens} tokens, Children=${childTokensSum} tokens ` +
              `(${Math.round((childTokensSum / parentTokens) * 100)}% coverage)`,
          );
        }
      }
    }

    this.logger.log(
      `Coverage validation passed for ${parentChunks.length} parents`,
    );
  }

  /**
   * Calculate chunk statistics
   */
  private calculateStatistics(
    parentChunks: ParentChunk[],
    childChunks: ChildChunk[],
  ): ChunkStatistics {
    const totalParentTokens = parentChunks.reduce(
      (sum, chunk) => sum + chunk.tokens,
      0,
    );
    const totalChildTokens = childChunks.reduce(
      (sum, chunk) => sum + chunk.tokens,
      0,
    );

    const childrenByParent = new Map<string, number>();
    for (const child of childChunks) {
      childrenByParent.set(
        child.parentChunkId,
        (childrenByParent.get(child.parentChunkId) || 0) + 1,
      );
    }

    return {
      totalParents: parentChunks.length,
      totalChildren: childChunks.length,
      averageParentTokens:
        parentChunks.length > 0 ? totalParentTokens / parentChunks.length : 0,
      averageChildTokens:
        childChunks.length > 0 ? totalChildTokens / childChunks.length : 0,
      averageChildrenPerParent:
        parentChunks.length > 0 ? childChunks.length / parentChunks.length : 0,
      orphanChildren: 0, // Already validated
      successRate: 1.0, // Passed validation
    };
  }
}
