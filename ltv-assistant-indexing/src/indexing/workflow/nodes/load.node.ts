/**
 * Load Stage Node for LangGraph Workflow
 * Based on specs from docs/plans/indexing-prd.md - Section: Định nghĩa Node
 */

import { Logger } from '@nestjs/common';
import { IndexingStateType } from '../indexing-state';
import { LoadStage } from '../../stages/load';

const logger = new Logger('LoadNode');

/**
 * Load Stage Node Function
 * This is a LangGraph node that executes the Load Stage
 *
 * @param state - Current workflow state
 * @param loadStage - Injected LoadStage service
 * @returns Partial state update
 */
export async function loadNode(
  state: IndexingStateType,
  loadStage: LoadStage,
): Promise<Partial<IndexingStateType>> {
  logger.log(`Executing Load Node for file: ${state.filename}`);

  try {
    // Execute Load Stage
    const loadOutput = await loadStage.execute({
      fileId: state.fileId,
      documentId: state.documentId,
      filePath: state.filePath,
      filename: state.filename,
      mimeType: state.mimeType,
    });

    // Update metrics
    const stagesCompleted = [...(state.metrics.stagesCompleted || []), 'load'];

    // Return state update
    return {
      buffer: loadOutput.buffer || null,
      streamPath: loadOutput.streamPath || null,
      loadMetadata: {
        fileId: loadOutput.metadata.fileId,
        filename: loadOutput.metadata.filename,
        size: loadOutput.metadata.size,
        mimeType: loadOutput.metadata.mimeType,
        checksumMd5: loadOutput.metadata.checksumMd5,
        retrievedAt: loadOutput.metadata.retrievedAt,
        loadMethod: loadOutput.metadata.loadMethod,
      },
      currentStage: 'load',
      metrics: {
        ...state.metrics,
        stagesCompleted,
      },
    };
  } catch (error) {
    logger.error(
      `Load node failed for file ${state.filename}`,
      error instanceof Error ? error.stack : String(error),
    );

    // Return error state
    return {
      currentStage: 'load_failed',
      errors: [
        ...state.errors,
        error instanceof Error ? error.message : String(error),
      ],
    };
  }
}

/**
 * Factory function to create Load Node with injected dependencies
 * This allows us to inject NestJS services into the LangGraph node
 */
export function createLoadNode(loadStage: LoadStage) {
  return async (
    state: IndexingStateType,
  ): Promise<Partial<IndexingStateType>> => {
    return loadNode(state, loadStage);
  };
}
