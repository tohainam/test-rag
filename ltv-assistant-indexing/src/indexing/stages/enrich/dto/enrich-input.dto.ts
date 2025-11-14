/**
 * Enrich Stage Input DTO
 * Receives data from Chunk Stage
 */

import type { ParentChunk, ChildChunk, ChunkLineage } from '../../chunk/types';
import type { StructuredDocument } from '../../structure/types';

export interface EnrichInputDto {
  documentId: string;
  fileId: string;
  filename: string;
  documentType: 'pdf' | 'docx' | 'text' | 'code' | 'markdown';

  // Chunks from Chunk Stage
  parentChunks: ParentChunk[];
  childChunks: ChildChunk[];
  lineage: ChunkLineage[];

  // Structured document for section metadata
  structuredDoc: StructuredDocument | null;

  // Metadata
  hasStructure: boolean;
}
