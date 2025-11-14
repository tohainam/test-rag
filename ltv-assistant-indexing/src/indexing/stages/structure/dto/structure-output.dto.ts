/**
 * Structure Stage Output DTO
 * Based on specs from docs/plans/structure-stage.md - Section: Điểm tích hợp
 */

import { StructuredDocument } from '../types';

/**
 * Output to Chunk Stage
 */
export interface StructureOutputDto {
  // Structured document with sections
  structuredDoc: StructuredDocument;

  // Structure metadata
  structureMetadata: {
    hasStructure: boolean;
    totalSections: number;
    maxDepth: number;
    detectionMethod: string;
    processingTime: number;
  };
}
