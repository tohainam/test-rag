/**
 * Parse Stage Output DTO
 * Based on specs from docs/plans/parse-stage.md - Section: Đầu ra
 */

import { Document } from '@langchain/core/documents';
import { ParseMetadata } from '../types/parse-types';

export interface ParseOutputDto {
  /**
   * Parsed documents (LangChain Document array)
   * Each document contains:
   * - pageContent: string (extracted text)
   * - metadata: object (file info, page numbers, statistics)
   */
  parsedDocs: Document[];

  /**
   * Parse operation metadata
   */
  parseMetadata: ParseMetadata;
}
