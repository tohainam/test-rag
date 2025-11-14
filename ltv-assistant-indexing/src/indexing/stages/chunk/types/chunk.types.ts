/**
 * Chunk Stage Types
 * Defines all type interfaces for the chunking stage
 */

/**
 * Parent chunk - larger chunks for context (1800 tokens target)
 * Does not need embedding, so no hard upper limit
 */
export interface ParentChunk {
  id: string;
  documentId: string;
  fileId: string;
  content: string;
  tokens: number;
  chunkIndex: number;
  metadata: ChunkMetadata;
}

/**
 * Child chunk - smaller chunks for precise retrieval (512 tokens target)
 * Must be embedded, so hard limit at 8,191 tokens (embedding model limit)
 */
export interface ChildChunk {
  id: string;
  parentChunkId: string;
  documentId: string;
  fileId: string;
  content: string;
  tokens: number;
  chunkIndex: number;
  metadata: ChunkMetadata;
}

/**
 * Chunk metadata preserved from structure stage
 */
export interface ChunkMetadata {
  sectionId: string;
  sectionPath: string;
  sectionLevel: number;
  offsetStart: number;
  offsetEnd: number;
  pageNumber?: number;
  isOnlyChild?: boolean;
}

/**
 * Lineage record for parent-child tracking
 */
export interface ChunkLineage {
  id: string;
  childChunkId: string;
  parentChunkId: string;
  documentId: string;
}

/**
 * Validation result for lineage validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Chunk statistics for reporting
 */
export interface ChunkStatistics {
  totalParents: number;
  totalChildren: number;
  averageParentTokens: number;
  averageChildTokens: number;
  averageChildrenPerParent: number;
  orphanChildren: number;
  successRate: number;
}

/**
 * Boundary annotation from Structure Stage
 */
export interface Boundary {
  type: 'section' | 'paragraph' | 'sentence';
  offset: number;
  strength: 'strong' | 'medium' | 'weak';
}

/**
 * Flat section from Structure Stage
 */
export interface FlatSection {
  id: string;
  title: string;
  level: number;
  content: string;
  sectionPath: string;
  boundaries: Boundary[];
  metadata: {
    offsetStart: number;
    offsetEnd: number;
    pageNumber?: number;
    wordCount: number;
  };
}
