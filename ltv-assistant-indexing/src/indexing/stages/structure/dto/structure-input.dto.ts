/**
 * Structure Stage Input DTO
 * Based on specs from docs/plans/structure-stage.md - Section: Điểm tích hợp
 */

import { Document } from '@langchain/core/documents';

/**
 * Input from Parse Stage
 */
export interface StructureInputDto {
  // File identifiers
  fileId: string;
  documentId: string;
  filename: string;

  // Parsed documents from Parse Stage
  parsedDocs: Document[];

  // Parse metadata
  parseMetadata: {
    fileId: string;
    filename: string;
    parserType: string;
    documentCount: number;
    totalCharacters: number;
  };
}
