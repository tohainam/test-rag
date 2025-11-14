/**
 * Metadata Enricher Service
 * Adds hierarchical metadata to chunks without modifying content
 * Based on specs from docs/plans/enrich-stage.md - ĐC-1
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ParentChunk, ChildChunk } from '../../chunk/types';
import type { HierarchicalMetadata } from '../types';

@Injectable()
export class MetadataEnricherService {
  private readonly logger = new Logger(MetadataEnricherService.name);

  /**
   * Enrich parent chunk with hierarchical metadata
   * @param chunk - Parent chunk from Chunk Stage
   * @param documentMetadata - Document-level metadata
   * @returns Hierarchical metadata
   */
  enrichParentMetadata(
    chunk: ParentChunk,
    documentMetadata: {
      documentId: string;
      fileId: string;
      filename: string;
      documentType: 'pdf' | 'docx' | 'text' | 'code' | 'markdown';
    },
  ): HierarchicalMetadata {
    // Extract existing metadata from chunk
    const existing = chunk.metadata as unknown as Record<string, unknown>;

    return {
      // Document context
      documentId: documentMetadata.documentId,
      fileId: documentMetadata.fileId,
      filename: documentMetadata.filename,
      documentType: documentMetadata.documentType,

      // Section context (preserved from Structure Stage)
      sectionPath: (existing.sectionPath as string) || '',
      sectionLevel: (existing.sectionLevel as number) || 0,
      sectionId: existing.sectionId as string | undefined,

      // Page/line context (if available from Parse Stage)
      pageNumber: existing.pageNumber as number | undefined,
      lineNumberStart: existing.lineNumberStart as number | undefined,
      lineNumberEnd: existing.lineNumberEnd as number | undefined,

      // Chunk hierarchy (for parent chunks, no parent ID)
      chunkIndex: chunk.chunkIndex,

      // Offsets (from original document)
      offsetStart: existing.offsetStart as number | undefined,
      offsetEnd: existing.offsetEnd as number | undefined,

      // Timestamps
      enrichedAt: new Date(),
    };
  }

  /**
   * Enrich child chunk with hierarchical metadata
   * @param chunk - Child chunk from Chunk Stage
   * @param parent - Parent chunk reference
   * @param documentMetadata - Document-level metadata
   * @returns Hierarchical metadata
   */
  enrichChildMetadata(
    chunk: ChildChunk,
    parent: ParentChunk,
    documentMetadata: {
      documentId: string;
      fileId: string;
      filename: string;
      documentType: 'pdf' | 'docx' | 'text' | 'code' | 'markdown';
    },
  ): HierarchicalMetadata {
    // Extract existing metadata from chunk
    const existing = chunk.metadata as unknown as Record<string, unknown>;

    return {
      // Document context
      documentId: documentMetadata.documentId,
      fileId: documentMetadata.fileId,
      filename: documentMetadata.filename,
      documentType: documentMetadata.documentType,

      // Section context (inherited from parent)
      sectionPath: (existing.sectionPath as string) || '',
      sectionLevel: (existing.sectionLevel as number) || 0,
      sectionId: existing.sectionId as string | undefined,

      // Page/line context (inherited from parent)
      pageNumber: existing.pageNumber as number | undefined,
      lineNumberStart: existing.lineNumberStart as number | undefined,
      lineNumberEnd: existing.lineNumberEnd as number | undefined,

      // Chunk hierarchy (child references parent)
      parentChunkId: chunk.parentChunkId,
      chunkIndex: chunk.chunkIndex,

      // Offsets (from original document)
      offsetStart: existing.offsetStart as number | undefined,
      offsetEnd: existing.offsetEnd as number | undefined,

      // Timestamps
      enrichedAt: new Date(),
    };
  }

  /**
   * Build child chunk IDs for parent metadata
   * @param parentId - Parent chunk ID
   * @param children - All child chunks
   * @returns Array of child chunk IDs
   */
  buildChildChunkIds(parentId: string, children: ChildChunk[]): string[] {
    return children
      .filter((child) => child.parentChunkId === parentId)
      .map((child) => child.id);
  }

  /**
   * Log enrichment summary
   * @param totalParents - Total parent chunks enriched
   * @param totalChildren - Total child chunks enriched
   */
  logEnrichmentSummary(totalParents: number, totalChildren: number): void {
    this.logger.log(
      `Metadata enrichment completed - Parents: ${totalParents}, Children: ${totalChildren}`,
    );
  }
}
