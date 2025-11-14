/**
 * Structure Node for LangGraph Workflow
 * Based on specs from docs/plans/structure-stage.md - Section: Điểm tích hợp
 *
 * This node executes the Structure Stage in the indexing pipeline:
 * Load → Parse → Structure → Chunk → Enrich → Embed → Persist
 */

import { Logger } from '@nestjs/common';
import { IndexingStateType } from '../indexing-state';
import { StructureStage } from '../../stages/structure/structure.stage';
import { StructureInputDto } from '../../stages/structure/dto';

/**
 * Create Structure node function for LangGraph
 *
 * @param structureStage - Structure stage service instance
 * @returns LangGraph node function
 */
export function createStructureNode(structureStage: StructureStage) {
  const logger = new Logger('StructureNode');

  return (state: IndexingStateType): Partial<IndexingStateType> => {
    logger.log(
      `Structure node executing for file: ${state.filename} (${state.fileId})`,
    );

    try {
      // Prepare input from state
      const input: StructureInputDto = {
        fileId: state.fileId,
        documentId: state.documentId,
        filename: state.filename,
        parsedDocs: state.parsedDocs,
        parseMetadata: {
          fileId: state.fileId,
          filename: state.filename,
          parserType: state.mimeType || 'text', // Fallback to text if no MIME type
          documentCount: state.parsedDocs.length,
          totalCharacters: state.parsedDocs.reduce(
            (sum, doc) => sum + doc.pageContent.length,
            0,
          ),
        },
      };

      // Execute Structure Stage
      const output = structureStage.execute(input);

      // Update state
      const updatedState: Partial<IndexingStateType> = {
        structuredDoc: output.structuredDoc,
        currentStage: 'structure',
        metrics: {
          ...state.metrics,
          stagesCompleted: [
            ...(state.metrics.stagesCompleted || []),
            'structure',
          ],
        },
      };

      logger.log(
        `Structure node completed: ${output.structuredDoc.metadata.totalSections} sections, ` +
          `hasStructure: ${output.structuredDoc.metadata.hasStructure}`,
      );

      return updatedState;
    } catch (error) {
      logger.error(
        `Structure node failed for ${state.filename}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Add error to state
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        currentStage: 'structure',
        errors: [...state.errors, `Structure stage failed: ${errorMessage}`],
      };
    }
  };
}
