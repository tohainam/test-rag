/**
 * Persist Stage LangGraph Node
 * Final stage - persists all processed data to MySQL and Qdrant
 * Based on specs from docs/plans/persist-stage.md
 */

import { Logger } from '@nestjs/common';
import { PersistStage } from '../../stages/persist/persist.stage';
import type { IndexingStateType } from '../indexing-state';
import type { PersistInputDto } from '../../stages/persist/dto';
import type { ChunkLineage } from '../../stages/persist/types';

const logger = new Logger('PersistNode');

/**
 * Create Persist Node for LangGraph workflow
 * This is the FINAL STAGE (7/7) in the indexing pipeline
 */
export function createPersistNode(persistStage: PersistStage) {
  return async (
    state: IndexingStateType,
  ): Promise<Partial<IndexingStateType>> => {
    logger.log(`[Persist Node] Starting for document ${state.documentId}`);

    // ============================================
    // Validate input
    // ============================================
    if (!state.embeddedChildren || state.embeddedChildren.length === 0) {
      throw new Error(
        'No embedded children chunks available for persist stage',
      );
    }

    if (!state.enrichedParents || state.enrichedParents.length === 0) {
      throw new Error('No enriched parent chunks available for persist stage');
    }

    if (!state.lineage || state.lineage.length === 0) {
      throw new Error('No chunk lineage available for persist stage');
    }

    // ============================================
    // Prepare lineage with proper typing
    // ============================================
    const lineage: ChunkLineage[] = state.lineage.map((item) => ({
      id: item.id,
      parentChunkId: item.parentChunkId,
      childChunkId: item.childChunkId,
      documentId: item.documentId,
      childOrder: 0, // Order can be derived from chunkIndex if needed
    }));

    // ============================================
    // Prepare input for Persist Stage
    // ============================================
    // Derive document type from filename extension or MIME type
    const getDocumentType = (
      filename: string,
      mimeType: string | null,
    ): 'pdf' | 'docx' | 'text' | 'code' | 'markdown' => {
      const ext = filename.toLowerCase().split('.').pop() || '';

      if (ext === 'pdf') return 'pdf';
      if (ext === 'docx' || ext === 'doc') return 'docx';
      if (ext === 'md' || ext === 'markdown') return 'markdown';
      if (
        ['js', 'ts', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'rb'].includes(ext)
      )
        return 'code';

      // Fallback to MIME type
      if (mimeType?.includes('pdf')) return 'pdf';
      if (mimeType?.includes('word') || mimeType?.includes('document'))
        return 'docx';

      return 'text'; // Default
    };

    const documentType = getDocumentType(state.filename, state.mimeType);

    const input: PersistInputDto = {
      documentId: state.documentId,
      fileId: state.fileId,
      filename: state.filename,
      documentType,
      embeddedChildren: state.embeddedChildren,
      embeddedSummaries: state.embeddedSummaries,
      embeddedQuestions: state.embeddedQuestions,
      parentChunksMetadata: state.enrichedParents,
      lineage,
    };

    // ============================================
    // Execute persist stage
    // ============================================
    const output = await persistStage.execute(input);

    if (!output.success) {
      // Persist stage failed - log detailed errors
      logger.error(`[Persist Node] Failed for document ${state.documentId}:`);
      logger.error(`  MySQL: ${output.mysql.success ? '✅' : '❌'}`);
      logger.error(`  Qdrant: ${output.qdrant.success ? '✅' : '❌'}`);
      logger.error(`  Rollback performed: ${output.rollbackPerformed}`);
      logger.error(`  Errors: ${output.errors.join('; ')}`);

      throw new Error(`Persist stage failed: ${output.errors.join('; ')}`);
    }

    logger.log(
      `[Persist Node] Completed successfully - ` +
        `MySQL: ${output.mysql.childChunksInserted} chunks, ` +
        `Qdrant: ${output.qdrant.childrenVectorsInserted} vectors ` +
        `(${output.totalDurationMs}ms)`,
    );

    // ============================================
    // Return state update
    // ============================================
    return {
      persistResult: {
        mysqlSuccess: output.mysql.success,
        qdrantSuccess: output.qdrant.success,
        timestamp: new Date(),
      },
      currentStage: 'persist',
      errors: [...state.errors, ...output.errors],
      metrics: {
        ...state.metrics,
        stagesCompleted: [...(state.metrics.stagesCompleted || []), 'persist'],
        endTime: new Date(),
        duration: state.metrics.startTime
          ? Date.now() - state.metrics.startTime.getTime()
          : 0,
      },
    };
  };
}
