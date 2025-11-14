/**
 * Enrich Stage Output DTO
 * Sends enriched chunks to Embed Stage
 */

import type {
  EnrichedParentChunk,
  EnrichedChildChunk,
  EnrichmentStatistics,
} from '../types';

export interface EnrichOutputDto {
  // Enriched chunks
  enrichedParents: EnrichedParentChunk[];
  enrichedChildren: EnrichedChildChunk[];

  // Metadata
  enrichmentMetadata: {
    totalParents: number;
    totalChildren: number;
    durationMs: number;
    llmEnrichmentUsed: boolean;
    statistics: EnrichmentStatistics;
  };

  // Errors encountered (non-fatal)
  errors: string[];
}
