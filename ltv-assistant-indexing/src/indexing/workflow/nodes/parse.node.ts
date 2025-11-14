/**
 * Parse Node for LangGraph Workflow
 * Based on specs from docs/plans/parse-stage.md - Section: Điểm tích hợp
 *
 * Integrates Parse Stage into LangGraph.js workflow
 */

import { Logger } from '@nestjs/common';
import { IndexingStateType } from '../indexing-state';
import { ParseStage } from '../../stages/parse/parse.stage';
import { ParseInputDto } from '../../stages/parse/dto';

const logger = new Logger('ParseNode');

/**
 * Create Parse Node function for LangGraph workflow
 *
 * @param parseStage - Parse Stage service instance
 * @returns Parse node function
 */
export function createParseNode(parseStage: ParseStage) {
  /**
   * Parse Node - Stage 2 of 7
   * Converts binary files into plain text using LangChain.js Document Loaders
   *
   * Input: State from Load Stage (with buffer or streamPath)
   * Output: State with parsedDocs array
   */
  return async (
    state: IndexingStateType,
  ): Promise<Partial<IndexingStateType>> => {
    logger.log(`[Parse Node] Starting for file: ${state.filename}`);

    try {
      // Validate Load Stage completed
      if (!state.loadMetadata) {
        throw new Error(
          'Load stage not completed - missing loadMetadata in state',
        );
      }

      // Build Parse Stage input from workflow state
      const parseInput: ParseInputDto = {
        fileId: state.fileId,
        documentId: state.documentId,
        filePath: state.streamPath || state.filePath,
        filename: state.filename,
        mimeType: state.loadMetadata.mimeType,
        buffer: state.buffer || undefined,
        streamPath: state.streamPath || undefined,
        fileSize: state.loadMetadata.size,
      };

      // Execute Parse Stage
      const parseOutput = await parseStage.execute(parseInput);

      logger.log(
        `[Parse Node] Completed - Parsed ${parseOutput.parsedDocs.length} document(s), ` +
          `${parseOutput.parseMetadata.totalCharacters} characters, ` +
          `${parseOutput.parseMetadata.parseTime}ms`,
      );

      // Update workflow state
      return {
        // Add parsed documents to state
        parsedDocs: parseOutput.parsedDocs,

        // Update current stage
        currentStage: 'parse',

        // Update metrics
        metrics: {
          ...state.metrics,
          stagesCompleted: [...(state.metrics.stagesCompleted || []), 'parse'],
        },
      };
    } catch (error) {
      logger.error(
        `[Parse Node] Failed for file: ${state.filename}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Add error to state but don't throw - let workflow handle it
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        currentStage: 'parse_failed',
        errors: [...state.errors, `Parse stage failed: ${errorMessage}`],
      };
    }
  };
}
