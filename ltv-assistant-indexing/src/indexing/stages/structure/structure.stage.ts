/**
 * Structure Stage Orchestrator
 * Based on specs from docs/plans/structure-stage.md
 *
 * The Structure Stage is the third of 7 stages in the indexing pipeline:
 * Load → Parse → Structure → Chunk → Enrich → Embed → Persist
 *
 * Responsibilities:
 * - Detect headings from parsed documents
 * - Build hierarchical document tree
 * - Generate section paths for navigation
 * - Detect boundaries for optimal chunking
 * - Flatten tree for next stage
 * - Fallback to flat structure if no headings detected
 */

import { Injectable, Logger } from '@nestjs/common';
import { StructureInputDto, StructureOutputDto } from './dto';
import { StructuredDocument } from './types';
import { HeadingDetectorFactory } from './detectors';
import {
  TreeConstructor,
  HierarchyValidator,
  SectionPathGenerator,
} from './builders';
import { BoundaryAnnotator } from './boundary';
import { TreeFlattener } from './flatteners';
import { EmptyInputError } from './errors/structure-errors';

@Injectable()
export class StructureStage {
  private readonly logger = new Logger(StructureStage.name);

  constructor(
    private readonly detectorFactory: HeadingDetectorFactory,
    private readonly treeConstructor: TreeConstructor,
    private readonly hierarchyValidator: HierarchyValidator,
    private readonly sectionPathGenerator: SectionPathGenerator,
    private readonly boundaryAnnotator: BoundaryAnnotator,
    private readonly treeFlattener: TreeFlattener,
  ) {}

  /**
   * Execute Structure Stage
   * Based on structure-stage.md - Section: Luồng dữ liệu
   *
   * @param input - Structure stage input
   * @returns Structure stage output
   */
  execute(input: StructureInputDto): StructureOutputDto {
    const startTime = Date.now();

    this.logger.log(
      `=== Structure Stage Start === File: ${input.filename} (${input.fileId})`,
    );

    try {
      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Detect headings
      const headingDetection = this.detectorFactory.detect(
        input.parsedDocs,
        input.parseMetadata.parserType,
        input.filename,
      );

      this.logger.log(
        `Heading detection: ${headingDetection.headings.length} headings found ` +
          `(confidence: ${headingDetection.confidence}, hasStructure: ${headingDetection.hasStructure})`,
      );

      // Step 3: Check if we have structure
      let structuredDoc: StructuredDocument;

      if (
        !headingDetection.hasStructure ||
        headingDetection.headings.length === 0
      ) {
        // Fallback: Create flat structure
        this.logger.warn(
          `No structure detected for ${input.filename}. Using flat fallback.`,
        );
        structuredDoc = this.createFlatStructure(input);
      } else {
        // Build hierarchical structure
        structuredDoc = this.buildHierarchicalStructure(
          input,
          headingDetection.headings,
        );
      }

      // Step 4: Calculate processing time
      const processingTime = Date.now() - startTime;

      const output: StructureOutputDto = {
        structuredDoc,
        structureMetadata: {
          hasStructure: headingDetection.hasStructure,
          totalSections: structuredDoc.metadata.totalSections,
          maxDepth: 0, // Will be calculated if hierarchical
          detectionMethod: this.getDetectionMethod(
            input.parseMetadata.parserType,
          ),
          processingTime,
        },
      };

      this.logger.log(
        `=== Structure Stage Complete === Duration: ${processingTime}ms, ` +
          `Sections: ${structuredDoc.metadata.totalSections}, ` +
          `HasStructure: ${headingDetection.hasStructure}`,
      );

      return output;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        `=== Structure Stage Failed === Duration: ${duration}ms, ` +
          `File: ${input.filename}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  /**
   * Validate input parameters
   *
   * @param input - Input to validate
   * @throws EmptyInputError if validation fails
   */
  private validateInput(input: StructureInputDto): void {
    if (!input.fileId || input.fileId.trim().length === 0) {
      throw new Error('fileId is required and cannot be empty');
    }

    if (!input.documentId || input.documentId.trim().length === 0) {
      throw new Error('documentId is required and cannot be empty');
    }

    if (!input.filename || input.filename.trim().length === 0) {
      throw new Error('filename is required and cannot be empty');
    }

    if (!input.parsedDocs || input.parsedDocs.length === 0) {
      throw new EmptyInputError(input.fileId, input.filename);
    }
  }

  /**
   * Build hierarchical structure from headings
   *
   * @param input - Structure input
   * @param headings - Detected headings
   * @returns Structured document
   */
  private buildHierarchicalStructure(
    input: StructureInputDto,
    headings: import('./types').Heading[],
  ): StructuredDocument {
    // Step 1: Build document tree
    const documentTree = this.treeConstructor.buildTree(
      headings,
      input.parsedDocs,
      input.fileId,
      input.filename,
    );

    // Step 2: Validate and auto-correct hierarchy
    const validationWarnings =
      this.hierarchyValidator.validateAndCorrect(documentTree);

    if (validationWarnings.length > 0) {
      this.logger.log(
        `Auto-corrected ${validationWarnings.length} hierarchy issues`,
      );
    }

    // Step 3: Generate section paths
    this.sectionPathGenerator.generatePaths(documentTree);

    // Step 4: Annotate with boundaries
    const fullText = input.parsedDocs.map((d) => d.pageContent).join('\n\n');
    const annotatedTree = this.boundaryAnnotator.annotate(
      documentTree,
      fullText,
    );

    // Step 5: Flatten tree
    const sections = this.treeFlattener.flatten(annotatedTree);

    // Step 6: Calculate statistics
    const stats = this.treeFlattener.calculateStatistics(sections);

    const structuredDoc: StructuredDocument = {
      id: input.fileId,
      title: input.filename,
      sections,
      metadata: {
        totalSections: stats.totalSections,
        averageWordCount: stats.averageWordCount,
        hasStructure: true,
      },
    };

    return structuredDoc;
  }

  /**
   * Create flat structure fallback
   * Used when no headings detected
   *
   * @param input - Structure input
   * @returns Flat structured document
   */
  private createFlatStructure(input: StructureInputDto): StructuredDocument {
    const fullText = input.parsedDocs.map((d) => d.pageContent).join('\n\n');

    const wordCount = fullText.split(/\s+/).filter((w) => w.length > 0).length;

    const flatSection: import('./types').FlatSection = {
      id: `${input.fileId}_section_0`,
      title: input.filename,
      level: 1,
      content: fullText,
      sectionPath: input.filename,
      boundaries: [],
      metadata: {
        sectionPath: input.filename,
        offsetStart: 0,
        offsetEnd: fullText.length,
        wordCount,
      },
    };

    return {
      id: input.fileId,
      title: input.filename,
      sections: [flatSection],
      metadata: {
        totalSections: 1,
        averageWordCount: wordCount,
        hasStructure: false,
      },
    };
  }

  /**
   * Get detection method name from parser type
   *
   * @param parserType - Parser type
   * @returns Detection method name
   */
  private getDetectionMethod(parserType: string): string {
    switch (parserType) {
      case 'markdown':
        return 'markdown-headings';
      case 'pdf':
        return 'pdf-heuristics';
      case 'docx':
        return 'docx-styles';
      case 'code':
        return 'code-structure';
      default:
        return 'text-patterns';
    }
  }
}
