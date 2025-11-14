/**
 * Chunk Node for LangGraph Workflow
 * Converts structured documents into parent and child chunks
 */

import { Logger } from '@nestjs/common';
import { ChunkStage } from '../../stages/chunk';
import type { IndexingStateType } from '../indexing-state';
import type { ChunkInputDto } from '../../stages/chunk/dto';

const logger = new Logger('ChunkNode');

/**
 * Create chunk node for LangGraph workflow
 * @param chunkStage - Injected ChunkStage service
 * @returns LangGraph node function
 */
export function createChunkNode(chunkStage: ChunkStage) {
  return async (
    state: IndexingStateType,
  ): Promise<Partial<IndexingStateType>> => {
    logger.log(
      `[Chunk Node] Starting chunk stage for document ${state.documentId}`,
    );

    const startTime = Date.now();

    try {
      // Validate input from Structure Stage
      if (!state.structuredDoc) {
        throw new Error(
          'No structured document available from Structure Stage',
        );
      }

      if (
        !state.structuredDoc.sections ||
        state.structuredDoc.sections.length === 0
      ) {
        throw new Error('Structured document has no sections');
      }

      // Prepare input for Chunk Stage
      const chunkInput: ChunkInputDto = {
        documentId: state.documentId,
        fileId: state.fileId,
        sections: state.structuredDoc.sections,
        hasStructure: state.structuredDoc.metadata?.hasStructure ?? false,
      };

      // Execute chunk stage
      const chunkOutput = await chunkStage.execute(chunkInput);

      const processingTime = Date.now() - startTime;

      logger.log(
        `[Chunk Node] Completed chunk stage in ${processingTime}ms - Parents: ${chunkOutput.parentChunks.length}, Children: ${chunkOutput.childChunks.length}`,
      );

      // Map chunk stage types to state types
      const parentChunks = chunkOutput.parentChunks.map((chunk) => ({
        id: chunk.id,
        documentId: chunk.documentId,
        fileId: chunk.fileId,
        content: chunk.content,
        tokens: chunk.tokens,
        chunkIndex: chunk.chunkIndex,
        metadata: chunk.metadata as unknown as Record<string, unknown>,
      }));

      const childChunks = chunkOutput.childChunks.map((chunk) => ({
        id: chunk.id,
        parentChunkId: chunk.parentChunkId,
        documentId: chunk.documentId,
        fileId: chunk.fileId,
        content: chunk.content,
        tokens: chunk.tokens,
        chunkIndex: chunk.chunkIndex,
        metadata: chunk.metadata as unknown as Record<string, unknown>,
      }));

      const lineage = chunkOutput.lineage.map((lin) => ({
        id: lin.id,
        childChunkId: lin.childChunkId,
        parentChunkId: lin.parentChunkId,
        documentId: lin.documentId,
      }));

      // Return partial state update
      return {
        parentChunks,
        childChunks,
        lineage,
        currentStage: 'chunk',
        errors: [...state.errors, ...chunkOutput.errors],
        metrics: {
          ...state.metrics,
          stagesCompleted: [...(state.metrics.stagesCompleted || []), 'chunk'],
          parentChunksCreated: parentChunks.length,
          childChunksCreated: childChunks.length,
        },
      };
    } catch (error) {
      logger.error(`[Chunk Node] Error during chunk stage:`, error);

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Return error state
      return {
        currentStage: 'chunk_error',
        errors: [...state.errors, `Chunk stage error: ${errorMessage}`],
      };
    }
  };
}
