/**
 * Enrich Node for LangGraph Workflow
 * Enriches parent and child chunks with metadata, entities, keywords, summaries, and questions
 * Based on specs from docs/plans/enrich-stage.md
 */

import { Logger } from '@nestjs/common';
import { EnrichStage } from '../../stages/enrich';
import type { IndexingStateType } from '../indexing-state';
import type { EnrichInputDto } from '../../stages/enrich/dto';

const logger = new Logger('EnrichNode');

/**
 * Create enrich node for LangGraph workflow
 * @param enrichStage - Injected EnrichStage service
 * @returns LangGraph node function
 */
export function createEnrichNode(enrichStage: EnrichStage) {
  return async (
    state: IndexingStateType,
  ): Promise<Partial<IndexingStateType>> => {
    logger.log(
      `[Enrich Node] Starting enrich stage for document ${state.documentId}`,
    );

    const startTime = Date.now();

    try {
      // Validate input from Chunk Stage
      if (!state.parentChunks || state.parentChunks.length === 0) {
        throw new Error('No parent chunks available from Chunk Stage');
      }

      if (!state.childChunks) {
        throw new Error('No child chunks available from Chunk Stage');
      }

      // Infer document type from mime type or filename
      const documentType = inferDocumentType(state.mimeType, state.filename);

      // Prepare input for Enrich Stage
      const enrichInput: EnrichInputDto = {
        documentId: state.documentId,
        fileId: state.fileId,
        filename: state.filename,
        documentType,
        parentChunks: state.parentChunks.map((chunk) => ({
          id: chunk.id,
          documentId: chunk.documentId,
          fileId: chunk.fileId,
          content: chunk.content,
          tokens: chunk.tokens,
          chunkIndex: chunk.chunkIndex,
          metadata:
            chunk.metadata as unknown as import('../../stages/chunk/types').ChunkMetadata,
        })),
        childChunks: state.childChunks.map((chunk) => ({
          id: chunk.id,
          parentChunkId: chunk.parentChunkId,
          documentId: chunk.documentId,
          fileId: chunk.fileId,
          content: chunk.content,
          tokens: chunk.tokens,
          chunkIndex: chunk.chunkIndex,
          metadata:
            chunk.metadata as unknown as import('../../stages/chunk/types').ChunkMetadata,
        })),
        lineage: state.lineage.map((lin) => ({
          id: lin.id,
          childChunkId: lin.childChunkId,
          parentChunkId: lin.parentChunkId,
          documentId: lin.documentId,
        })),
        structuredDoc: state.structuredDoc,
        hasStructure: state.structuredDoc?.metadata?.hasStructure ?? false,
      };

      // Execute enrich stage
      const enrichOutput = await enrichStage.execute(enrichInput);

      const processingTime = Date.now() - startTime;

      logger.log(
        `[Enrich Node] Completed enrich stage in ${processingTime}ms - ` +
          `Enriched Parents: ${enrichOutput.enrichedParents.length}, ` +
          `Enriched Children: ${enrichOutput.enrichedChildren.length}, ` +
          `LLM Used: ${enrichOutput.enrichmentMetadata.llmEnrichmentUsed}`,
      );

      // Map enrich stage types to state types
      // EnrichedParentChunk and EnrichedChildChunk already have the correct type from enrich stage
      // No need to restructure - just return them as-is
      const enrichedParents = enrichOutput.enrichedParents;
      const enrichedChildren = enrichOutput.enrichedChildren;

      // Return partial state update
      return {
        enrichedParents,
        enrichedChildren,
        currentStage: 'enrich',
        errors: [...state.errors, ...enrichOutput.errors],
        metrics: {
          ...state.metrics,
          stagesCompleted: [...(state.metrics.stagesCompleted || []), 'enrich'],
        },
      };
    } catch (error) {
      logger.error(`[Enrich Node] Error during enrich stage:`, error);

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Return error state
      return {
        currentStage: 'enrich_error',
        errors: [...state.errors, `Enrich stage error: ${errorMessage}`],
      };
    }
  };
}

/**
 * Infer document type from mime type or filename
 */
function inferDocumentType(
  mimeType: string | null,
  filename: string,
): 'pdf' | 'docx' | 'text' | 'code' | 'markdown' {
  if (mimeType) {
    if (mimeType.includes('pdf')) return 'pdf';
    if (
      mimeType.includes('word') ||
      mimeType.includes('officedocument.wordprocessing')
    )
      return 'docx';
    if (mimeType.includes('text')) return 'text';
  }

  // Fallback to filename extension
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'docx':
    case 'doc':
      return 'docx';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'py':
    case 'java':
    case 'cpp':
    case 'c':
    case 'go':
    case 'rs':
      return 'code';
    default:
      return 'text';
  }
}
