import {
  ParentChunk,
  ChildChunk,
  ChunkLineage,
  ChunkStatistics,
} from '../types';

/**
 * Output DTO for Chunk Stage
 * Returns chunked documents with lineage tracking
 */
export interface ChunkOutputDto {
  parentChunks: ParentChunk[];
  childChunks: ChildChunk[];
  lineage: ChunkLineage[];
  chunkMetadata: ChunkOutputMetadata;
  errors: string[];
}

/**
 * Chunk output metadata for audit and debugging
 */
export interface ChunkOutputMetadata {
  totalParentChunks: number;
  totalChildChunks: number;
  averageParentTokens: number;
  averageChildTokens: number;
  averageChildrenPerParent: number;
  processingTime: number;
  statistics: ChunkStatistics;
}
