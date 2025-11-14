/**
 * Persist Stage Input DTO
 * Based on specs from docs/plans/persist-stage.md
 */

import type {
  ChildChunkWithEmbedding,
  SummaryWithEmbedding,
  HypotheticalQuestionWithEmbedding,
} from '../../embed/types';
import type { EnrichedParentChunk } from '../../enrich/types/enrich.types';
import type { ChunkLineage } from '../types';

export interface PersistInputDto {
  // Document metadata
  documentId: string;
  fileId: string;
  filename: string;
  documentType: 'pdf' | 'docx' | 'text' | 'code' | 'markdown';

  // From Embed Stage (Multi-Vector)
  embeddedChildren: ChildChunkWithEmbedding[];
  embeddedSummaries?: SummaryWithEmbedding[];
  embeddedQuestions?: HypotheticalQuestionWithEmbedding[];

  // Metadata for MySQL (parent chunks without embeddings)
  parentChunksMetadata: EnrichedParentChunk[];

  // Chunk lineage for MySQL
  lineage: ChunkLineage[];
}
