import { FlatSection } from '../types';

/**
 * Input DTO for Chunk Stage
 * Receives structured document from Structure Stage
 */
export interface ChunkInputDto {
  documentId: string;
  fileId: string;
  sections: FlatSection[];
  hasStructure: boolean;
}
