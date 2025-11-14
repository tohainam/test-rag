/**
 * Structure Stage Module
 * Based on specs from docs/plans/structure-stage.md
 */

import { Module } from '@nestjs/common';
import { StructureStage } from './structure.stage';

// Detectors
import {
  MarkdownHeadingDetector,
  PdfHeadingDetector,
  AllCapsHeadingDetector,
  DocxHeadingDetector,
  CodeHeadingDetector,
  HeadingDetectorFactory,
} from './detectors';

// Builders
import {
  TreeConstructor,
  HierarchyValidator,
  SectionPathGenerator,
} from './builders';

// Boundary
import {
  ParagraphBoundaryDetector,
  SentenceBoundaryDetector,
  BoundaryAnnotator,
} from './boundary';

// Flatteners
import { TreeFlattener } from './flatteners';

@Module({
  providers: [
    // Main stage
    StructureStage,

    // Detectors
    MarkdownHeadingDetector,
    PdfHeadingDetector,
    AllCapsHeadingDetector,
    DocxHeadingDetector,
    CodeHeadingDetector,
    HeadingDetectorFactory,

    // Builders
    TreeConstructor,
    HierarchyValidator,
    SectionPathGenerator,

    // Boundary
    ParagraphBoundaryDetector,
    SentenceBoundaryDetector,
    BoundaryAnnotator,

    // Flatteners
    TreeFlattener,
  ],
  exports: [StructureStage],
})
export class StructureStageModule {}
