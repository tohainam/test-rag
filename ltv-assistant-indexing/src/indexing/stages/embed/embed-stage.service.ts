/**
 * Embed Stage Service
 * Multi-Vector Retrieval Orchestrator: Child Chunks + Summaries + Hypothetical Questions
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { EmbeddingProviderFactory } from './embedding-provider.factory';
import { EmbeddingGenerationService } from './embedding-generation.service';
import { SparseEmbeddingService } from './sparse-embedding.service';
import type {
  EmbedInputDto,
  EmbedOutputDto,
  ChildChunkWithEmbedding,
  SummaryWithEmbedding,
  HypotheticalQuestionWithEmbedding,
  EmbeddingMetadata,
} from './types';
import type {
  EnrichedParentChunk,
  EnrichedChildChunk,
} from '../enrich/types/enrich.types';

@Injectable()
export class EmbedStageService {
  private readonly logger = new Logger(EmbedStageService.name);

  constructor(
    private readonly embeddingProviderFactory: EmbeddingProviderFactory,
    private readonly embeddingGenerationService: EmbeddingGenerationService,
    private readonly sparseEmbeddingService: SparseEmbeddingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Execute Embed Stage: Multi-Vector + Hybrid Search
   */
  async execute(input: EmbedInputDto): Promise<EmbedOutputDto> {
    const startTime = Date.now();

    this.logger.log(
      `[Embed Stage] Starting for document ${input.documentId} ` +
        `(${input.enrichedChildren.length} children, ${input.enrichedParents.length} parents)`,
    );

    const errors: string[] = [];

    try {
      // Update BM25 vocabulary with all content
      this.updateVocabulary(input);

      // 1. Embed child chunks (REQUIRED)
      const embeddedChildren = await this.embedChildChunks(
        input.enrichedChildren,
        errors,
      );

      // 2. Embed summaries (OPTIONAL - if enabled)
      let embeddedSummaries: SummaryWithEmbedding[] | undefined;
      const summariesEnabled = this.configService.get<boolean>(
        'SUMMARY_GENERATION_ENABLED',
        true,
      );

      if (summariesEnabled) {
        embeddedSummaries = await this.embedSummaries(
          input.enrichedParents,
          errors,
        );
      } else {
        this.logger.log('[Embed Stage] Summary embeddings disabled');
      }

      // 3. Embed hypothetical questions (OPTIONAL - if enabled)
      let embeddedQuestions: HypotheticalQuestionWithEmbedding[] | undefined;
      const questionsEnabled = this.configService.get<boolean>(
        'HYPOTHETICAL_QUESTIONS_ENABLED',
        true,
      );

      if (questionsEnabled) {
        embeddedQuestions = await this.embedHypotheticalQuestions(
          input.enrichedParents,
          errors,
        );
      } else {
        this.logger.log(
          '[Embed Stage] Hypothetical question embeddings disabled',
        );
      }

      // Note: Parent chunks don't need to be passed through
      // They are always available in the graph state

      // Calculate metrics
      const durationMs = Date.now() - startTime;
      const totalVectors =
        embeddedChildren.length +
        (embeddedSummaries?.length || 0) +
        (embeddedQuestions?.length || 0);

      const embeddingMetadata: EmbeddingMetadata = {
        provider: this.embeddingProviderFactory.getProviderConfig().provider,
        model: this.embeddingProviderFactory.getProviderConfig().model,
        dimensions: this.embeddingGenerationService.getEmbeddingDimensions(),
        sparseMethod: 'BM25',
        totalChildren: input.enrichedChildren.length,
        embeddedChildrenCount: embeddedChildren.length,
        embeddedSummariesCount: embeddedSummaries?.length || 0,
        embeddedQuestionsCount: embeddedQuestions?.length || 0,
        failedCount: input.enrichedChildren.length - embeddedChildren.length,
        successRate: embeddedChildren.length / input.enrichedChildren.length,
        durationMs,
      };

      // Validate success rate
      if (embeddingMetadata.successRate < 0.99) {
        throw new Error(
          `Embedding success rate too low: ${(embeddingMetadata.successRate * 100).toFixed(1)}% ` +
            `(${embeddingMetadata.failedCount}/${embeddingMetadata.totalChildren} failed)`,
        );
      }

      this.logger.log(
        `[Embed Stage] Completed successfully - ` +
          `${totalVectors} total vectors (${embeddedChildren.length} children, ` +
          `${embeddedSummaries?.length || 0} summaries, ` +
          `${embeddedQuestions?.length || 0} questions) in ${durationMs}ms`,
      );

      return {
        embeddedChildren,
        embeddedSummaries,
        embeddedQuestions,
        embeddingMetadata,
        errors,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this.logger.error(
        `[Embed Stage] Failed after ${durationMs}ms: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw error;
    }
  }

  /**
   * Update BM25 vocabulary with all content
   */
  private updateVocabulary(input: EmbedInputDto): void {
    const allTexts = [
      ...input.enrichedChildren.map((c) => c.content),
      ...input.enrichedParents.flatMap((p) => {
        const texts = [p.content];
        if (p.metadata.summary) texts.push(p.metadata.summary);
        if (p.metadata.hypotheticalQuestions)
          texts.push(...p.metadata.hypotheticalQuestions);
        return texts;
      }),
    ];

    this.sparseEmbeddingService.updateVocabulary(allTexts);
  }

  /**
   * Embed child chunks (Dense + Sparse)
   */
  private async embedChildChunks(
    enrichedChildren: EnrichedChildChunk[],
    errors: string[],
  ): Promise<ChildChunkWithEmbedding[]> {
    this.logger.log(`Embedding ${enrichedChildren.length} child chunks...`);

    // Generate dense embeddings
    const batchResult =
      await this.embeddingGenerationService.generateEmbeddings(
        enrichedChildren.map((c) => ({ id: c.id, content: c.content })),
      );

    // Add failures to errors
    for (const failed of batchResult.failed) {
      errors.push(`Child chunk ${failed.id} embedding failed: ${failed.error}`);
    }

    // Generate sparse embeddings and combine
    const embeddedChildren: ChildChunkWithEmbedding[] = [];

    for (const success of batchResult.successful) {
      const child = enrichedChildren.find((c) => c.id === success.id);
      if (!child) continue;

      const sparseEmbedding =
        this.sparseEmbeddingService.generateSparseEmbedding(child.content);

      const embeddedChild: ChildChunkWithEmbedding = {
        ...child,
        denseEmbedding: success.embedding,
        sparseEmbedding,
      };

      embeddedChildren.push(embeddedChild);
    }

    this.logger.log(
      `Embedded ${embeddedChildren.length}/${enrichedChildren.length} child chunks`,
    );

    return embeddedChildren;
  }

  /**
   * Embed summaries (Dense + Sparse)
   */
  private async embedSummaries(
    enrichedParents: EnrichedParentChunk[],
    errors: string[],
  ): Promise<SummaryWithEmbedding[]> {
    const parentsWithSummaries = enrichedParents.filter(
      (p) => p.metadata.summary,
    );

    if (parentsWithSummaries.length === 0) {
      this.logger.log('No summaries to embed');
      return [];
    }

    this.logger.log(`Embedding ${parentsWithSummaries.length} summaries...`);

    // Generate dense embeddings
    const batchResult =
      await this.embeddingGenerationService.generateEmbeddings(
        parentsWithSummaries.map((p) => ({
          id: p.id,
          content: p.metadata.summary!,
        })),
      );

    // Add failures to errors
    for (const failed of batchResult.failed) {
      errors.push(`Summary ${failed.id} embedding failed: ${failed.error}`);
    }

    // Generate sparse embeddings and combine
    const embeddedSummaries: SummaryWithEmbedding[] = [];

    for (const success of batchResult.successful) {
      const parent = parentsWithSummaries.find((p) => p.id === success.id);
      if (!parent || !parent.metadata.summary) continue;

      const sparseEmbedding =
        this.sparseEmbeddingService.generateSparseEmbedding(
          parent.metadata.summary,
        );

      embeddedSummaries.push({
        id: uuidv4(),
        parentChunkId: parent.id,
        documentId: parent.documentId,
        summary: parent.metadata.summary,
        denseEmbedding: success.embedding,
        sparseEmbedding,
      });
    }

    this.logger.log(
      `Embedded ${embeddedSummaries.length}/${parentsWithSummaries.length} summaries`,
    );

    return embeddedSummaries;
  }

  /**
   * Embed hypothetical questions (Dense + Sparse)
   */
  private async embedHypotheticalQuestions(
    enrichedParents: EnrichedParentChunk[],
    errors: string[],
  ): Promise<HypotheticalQuestionWithEmbedding[]> {
    const parentsWithQuestions = enrichedParents.filter(
      (p) =>
        p.metadata.hypotheticalQuestions &&
        p.metadata.hypotheticalQuestions.length > 0,
    );

    if (parentsWithQuestions.length === 0) {
      this.logger.log('No hypothetical questions to embed');
      return [];
    }

    // Flatten all questions
    const questionItems: Array<{
      id: string;
      parentChunkId: string;
      documentId: string;
      question: string;
    }> = [];

    for (const parent of parentsWithQuestions) {
      if (!parent.metadata.hypotheticalQuestions) continue;

      for (const question of parent.metadata.hypotheticalQuestions) {
        questionItems.push({
          id: uuidv4(),
          parentChunkId: parent.id,
          documentId: parent.documentId,
          question,
        });
      }
    }

    this.logger.log(
      `Embedding ${questionItems.length} hypothetical questions...`,
    );

    // Generate dense embeddings
    const batchResult =
      await this.embeddingGenerationService.generateEmbeddings(
        questionItems.map((q) => ({ id: q.id, content: q.question })),
      );

    // Add failures to errors
    for (const failed of batchResult.failed) {
      errors.push(
        `Hypothetical question ${failed.id} embedding failed: ${failed.error}`,
      );
    }

    // Generate sparse embeddings and combine
    const embeddedQuestions: HypotheticalQuestionWithEmbedding[] = [];

    for (const success of batchResult.successful) {
      const questionItem = questionItems.find((q) => q.id === success.id);
      if (!questionItem) continue;

      const sparseEmbedding =
        this.sparseEmbeddingService.generateSparseEmbedding(
          questionItem.question,
        );

      embeddedQuestions.push({
        id: questionItem.id,
        parentChunkId: questionItem.parentChunkId,
        documentId: questionItem.documentId,
        question: questionItem.question,
        denseEmbedding: success.embedding,
        sparseEmbedding,
      });
    }

    this.logger.log(
      `Embedded ${embeddedQuestions.length}/${questionItems.length} hypothetical questions`,
    );

    return embeddedQuestions;
  }
}
