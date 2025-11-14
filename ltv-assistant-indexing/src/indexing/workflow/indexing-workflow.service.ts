/**
 * Indexing Workflow Service
 * Based on specs from docs/plans/indexing-prd.md - Section: Xây dựng Graph
 *
 * This service creates and manages the LangGraph.js StateGraph for the
 * 7-stage indexing pipeline: Load → Parse → Structure → Chunk → Enrich → Embed → Persist
 */

import { Injectable, Logger } from '@nestjs/common';
import { StateGraph, START, END } from '@langchain/langgraph';
import {
  IndexingState,
  IndexingStateType,
  createInitialState,
} from './indexing-state';
import { createLoadNode } from './nodes/load.node';
import { createParseNode } from './nodes/parse.node';
import { createStructureNode } from './nodes/structure.node';
import { createChunkNode } from './nodes/chunk.node';
import { createEnrichNode } from './nodes/enrich.node';
import { createEmbedNode } from './nodes/embed.node';
import { createPersistNode } from './nodes/persist.node';
import { LoadStage } from '../stages/load';
import { ParseStage } from '../stages/parse/parse.stage';
import { StructureStage } from '../stages/structure';
import { ChunkStage } from '../stages/chunk';
import { EnrichStage } from '../stages/enrich';
import { EmbedStageService } from '../stages/embed';
import { PersistStage } from '../stages/persist';

export interface FileJobData {
  fileId: string;
  documentId: string;
  filePath: string;
  filename: string;
  mimeType: string | null;
}

export interface WorkflowResult {
  success: boolean;
  finalState: IndexingStateType;
  errors: string[];
  metrics: {
    duration: number;
    stagesCompleted: string[];
  };
}

/**
 * Type guard to validate workflow result matches expected state type
 */
function isIndexingStateType(value: unknown): value is IndexingStateType {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const state = value as Record<string, unknown>;

  return (
    typeof state.fileId === 'string' &&
    typeof state.documentId === 'string' &&
    typeof state.filename === 'string' &&
    typeof state.currentStage === 'string' &&
    Array.isArray(state.errors) &&
    typeof state.metrics === 'object' &&
    state.metrics !== null
  );
}

@Injectable()
export class IndexingWorkflowService {
  private readonly logger = new Logger(IndexingWorkflowService.name);
  private workflow: ReturnType<typeof StateGraph.prototype.compile> | null =
    null;

  constructor(
    private readonly loadStage: LoadStage,
    private readonly parseStage: ParseStage,
    private readonly structureStage: StructureStage,
    private readonly chunkStage: ChunkStage,
    private readonly enrichStage: EnrichStage,
    private readonly embedStage: EmbedStageService,
    private readonly persistStage: PersistStage,
  ) {
    this.initializeWorkflow();
  }

  /**
   * Initialize the LangGraph workflow
   * Based on PRD Section: Xây dựng Graph
   */
  private initializeWorkflow(): void {
    this.logger.log('Initializing LangGraph indexing workflow...');

    try {
      // Create StateGraph with IndexingState
      // Based on LangGraph.js official docs: Use START/END with addEdge()
      const graph = new StateGraph(IndexingState)
        // Add nodes (stages 1-7)
        .addNode('load', createLoadNode(this.loadStage))
        .addNode('parse', createParseNode(this.parseStage))
        .addNode('structure', createStructureNode(this.structureStage))
        .addNode('chunk', createChunkNode(this.chunkStage))
        .addNode('enrich', createEnrichNode(this.enrichStage))
        .addNode('embed', createEmbedNode(this.embedStage))
        .addNode('persist', createPersistNode(this.persistStage))
        // Define edges: START → load → parse → structure → chunk → enrich → embed → persist → END
        .addEdge(START, 'load')
        .addEdge('load', 'parse')
        .addEdge('parse', 'structure')
        .addEdge('structure', 'chunk')
        .addEdge('chunk', 'enrich')
        .addEdge('enrich', 'embed')
        .addEdge('embed', 'persist')
        .addEdge('persist', END);

      // Compile the workflow (no checkpointer - stateless workflow)
      this.workflow = graph.compile();

      this.logger.log('✓ LangGraph indexing workflow initialized successfully');
    } catch (error) {
      this.logger.error(
        'Failed to initialize LangGraph workflow',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Execute the indexing workflow
   * Based on PRD Section: Thực thi Workflow
   *
   * @param jobData - File job data from BullMQ
   * @returns Workflow execution result
   */
  async executeWorkflow(jobData: FileJobData): Promise<WorkflowResult> {
    const startTime = Date.now();

    this.logger.log(
      `Starting indexing workflow for file: ${jobData.filename} (${jobData.fileId})`,
    );

    try {
      // Create initial state
      const initialState = createInitialState({
        fileId: jobData.fileId,
        documentId: jobData.documentId,
        filePath: jobData.filePath,
        filename: jobData.filename,
        mimeType: jobData.mimeType,
      });

      // Execute workflow
      if (!this.workflow) {
        throw new Error('Workflow not initialized');
      }

      const result = await this.workflow.invoke(initialState);

      // Type guard validation
      if (!isIndexingStateType(result)) {
        throw new Error('Workflow returned invalid state type');
      }

      const finalState: IndexingStateType = result;

      // Calculate metrics
      const duration = Date.now() - startTime;
      const stagesCompleted = finalState.metrics.stagesCompleted ?? [];

      // Check for errors
      if (finalState.errors.length > 0) {
        this.logger.warn(
          `Workflow completed with errors for ${jobData.filename}: ${finalState.errors.join(', ')}`,
        );

        return {
          success: false,
          finalState,
          errors: finalState.errors,
          metrics: {
            duration,
            stagesCompleted,
          },
        };
      }

      this.logger.log(
        `✓ Workflow completed successfully for ${jobData.filename} ` +
          `(${duration}ms, stages: ${stagesCompleted.join(' → ')})`,
      );

      return {
        success: true,
        finalState,
        errors: [],
        metrics: {
          duration,
          stagesCompleted,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        `Workflow execution failed for ${jobData.filename} (${duration}ms)`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  /**
   * Get workflow status
   */
  isInitialized(): boolean {
    return this.workflow !== null;
  }
}
