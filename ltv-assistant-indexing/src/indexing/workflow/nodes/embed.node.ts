/**
 * Embed Stage LangGraph Node
 * Multi-Vector Embedding with Hybrid Search (Dense + Sparse)
 */

import { Logger } from '@nestjs/common';
import { EmbedStageService } from '../../stages/embed/embed-stage.service';
import type { IndexingStateType } from '../indexing-state';
import type { EmbedInputDto } from '../../stages/embed/types';

const logger = new Logger('EmbedNode');

/**
 * Create Embed Node for LangGraph workflow
 */
export function createEmbedNode(embedStage: EmbedStageService) {
  return async (
    state: IndexingStateType,
  ): Promise<Partial<IndexingStateType>> => {
    logger.log(`[Embed Node] Starting for document ${state.documentId}`);

    // Validate input
    if (!state.enrichedChildren || state.enrichedChildren.length === 0) {
      throw new Error(
        'No enriched children chunks available for embedding stage',
      );
    }

    if (!state.enrichedParents || state.enrichedParents.length === 0) {
      throw new Error(
        'No enriched parent chunks available for embedding stage',
      );
    }

    // Prepare input
    const input: EmbedInputDto = {
      enrichedParents: state.enrichedParents,
      enrichedChildren: state.enrichedChildren,
      documentId: state.documentId,
      metadata: {
        totalParents: state.enrichedParents.length,
        totalChildren: state.enrichedChildren.length,
      },
    };

    // Execute embed stage
    const output = await embedStage.execute(input);

    logger.log(
      `[Embed Node] Completed - ` +
        `Children: ${output.embeddedChildren.length}, ` +
        `Summaries: ${output.embeddedSummaries?.length || 0}, ` +
        `Questions: ${output.embeddedQuestions?.length || 0}`,
    );

    // Return state update
    // Note: Parent chunks remain unchanged in graph state
    return {
      embeddedChildren: output.embeddedChildren,
      embeddedSummaries: output.embeddedSummaries,
      embeddedQuestions: output.embeddedQuestions,
      embeddingMetadata: output.embeddingMetadata,
      currentStage: 'embed',
      errors: [...state.errors, ...output.errors],
      metrics: {
        ...state.metrics,
        stagesCompleted: [...(state.metrics.stagesCompleted || []), 'embed'],
        embeddingsGenerated:
          output.embeddedChildren.length +
          (output.embeddedSummaries?.length || 0) +
          (output.embeddedQuestions?.length || 0),
      },
    };
  };
}
