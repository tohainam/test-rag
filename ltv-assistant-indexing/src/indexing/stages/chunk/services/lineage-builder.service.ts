import { Injectable, Logger } from '@nestjs/common';
import { ChildChunk, ChunkLineage } from '../types';
import { ChunkIdGeneratorService } from './chunk-id-generator.service';

/**
 * Lineage Builder Service
 * Builds parent-child lineage records for chunk tracking
 */
@Injectable()
export class LineageBuilderService {
  private readonly logger = new Logger(LineageBuilderService.name);

  constructor(private readonly idGenerator: ChunkIdGeneratorService) {}

  /**
   * Build lineage records from child chunks
   * @param childChunks - Array of child chunks
   * @returns Array of lineage records
   */
  buildLineage(childChunks: ChildChunk[]): ChunkLineage[] {
    const lineageRecords: ChunkLineage[] = [];

    for (const child of childChunks) {
      const lineage: ChunkLineage = {
        id: this.idGenerator.generateLineageId(child.id, child.parentChunkId),
        childChunkId: child.id,
        parentChunkId: child.parentChunkId,
        documentId: child.documentId,
      };

      lineageRecords.push(lineage);
    }

    this.logger.log(`Built ${lineageRecords.length} lineage records`);

    return lineageRecords;
  }

  /**
   * Group children by parent ID
   * @param childChunks - Array of child chunks
   * @returns Map of parent ID to child chunks
   */
  groupChildrenByParent(childChunks: ChildChunk[]): Map<string, ChildChunk[]> {
    const groupedChildren = new Map<string, ChildChunk[]>();

    for (const child of childChunks) {
      const existing = groupedChildren.get(child.parentChunkId) || [];
      existing.push(child);
      groupedChildren.set(child.parentChunkId, existing);
    }

    return groupedChildren;
  }

  /**
   * Calculate lineage statistics
   * @param childChunks - Array of child chunks
   * @param totalParents - Total number of parent chunks
   * @returns Lineage statistics
   */
  calculateStatistics(
    childChunks: ChildChunk[],
    totalParents: number,
  ): {
    totalChildren: number;
    averageChildrenPerParent: number;
    parentsWithChildren: number;
  } {
    const childrenByParent = this.groupChildrenByParent(childChunks);

    return {
      totalChildren: childChunks.length,
      averageChildrenPerParent: childChunks.length / totalParents,
      parentsWithChildren: childrenByParent.size,
    };
  }
}
