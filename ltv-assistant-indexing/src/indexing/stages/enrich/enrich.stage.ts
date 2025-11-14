/**
 * Enrich Stage - Main Orchestrator
 * Orchestrates all enrichment services to add metadata and semantic information
 * Based on specs from docs/plans/enrich-stage.md - ĐC-7
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnrichInputDto, EnrichOutputDto } from './dto';
import type {
  EnrichedParentChunk,
  EnrichedChildChunk,
  EnrichmentStatistics,
} from './types';
import {
  MetadataEnricherService,
  AlgorithmicEntityExtractorService,
  KeywordExtractorService,
  LlmEnricherService,
  HypotheticalQuestionsGeneratorService,
} from './services';
import {
  EmptyChunksError,
  ContentModifiedError,
  TokenCountMismatchError,
} from './errors';

@Injectable()
export class EnrichStage {
  private readonly logger = new Logger(EnrichStage.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly metadataEnricher: MetadataEnricherService,
    private readonly entityExtractor: AlgorithmicEntityExtractorService,
    private readonly keywordExtractor: KeywordExtractorService,
    private readonly llmEnricher: LlmEnricherService,
    private readonly hypotheticalQuestionsGenerator: HypotheticalQuestionsGeneratorService,
  ) {}

  /**
   * Execute enrich stage
   * @param input - Enrich input from Chunk Stage
   * @returns Enrich output with enriched chunks
   */
  async execute(input: EnrichInputDto): Promise<EnrichOutputDto> {
    const startTime = Date.now();
    this.logger.log(
      `Starting enrich stage for document ${input.documentId} - ` +
        `Parents: ${input.parentChunks.length}, Children: ${input.childChunks.length}`,
    );

    // Validate input
    if (input.parentChunks.length === 0 && input.childChunks.length === 0) {
      throw new EmptyChunksError();
    }

    // Document-level metadata
    const documentMetadata = {
      documentId: input.documentId,
      fileId: input.fileId,
      filename: input.filename,
      documentType: input.documentType,
    };

    // Enrich parent chunks
    const enrichedParents = await this.enrichParentChunks(
      input.parentChunks,
      documentMetadata,
    );

    // Enrich child chunks
    const enrichedChildren = this.enrichChildChunks(
      input.childChunks,
      input.parentChunks,
      documentMetadata,
    );

    // Calculate statistics
    const statistics = this.calculateStatistics(
      enrichedParents,
      enrichedChildren,
    );

    const durationMs = Date.now() - startTime;

    this.logger.log(
      `Enrich stage completed in ${durationMs}ms - ` +
        `LLM used: ${this.llmEnricher.isEnabled() || this.hypotheticalQuestionsGenerator.isEnabled()}`,
    );

    return {
      enrichedParents,
      enrichedChildren,
      enrichmentMetadata: {
        totalParents: enrichedParents.length,
        totalChildren: enrichedChildren.length,
        durationMs,
        llmEnrichmentUsed:
          this.llmEnricher.isEnabled() ||
          this.hypotheticalQuestionsGenerator.isEnabled(),
        statistics,
      },
      errors: [],
    };
  }

  /**
   * Enrich parent chunks with all enrichments
   */
  private async enrichParentChunks(
    parents: EnrichInputDto['parentChunks'],
    documentMetadata: {
      documentId: string;
      fileId: string;
      filename: string;
      documentType: 'pdf' | 'docx' | 'text' | 'code' | 'markdown';
    },
  ): Promise<EnrichedParentChunk[]> {
    const enriched: EnrichedParentChunk[] = [];
    const entityExtractionEnabled =
      this.configService.get<boolean>('ENTITY_EXTRACTION_ENABLED') ?? true;
    const keywordExtractionMethod =
      this.configService.get<string>('KEYWORD_EXTRACTION_METHOD') || 'tfidf';

    // First pass: Add hierarchical metadata and algorithmic enrichments
    for (const parent of parents) {
      try {
        // 1. Add hierarchical metadata (REQUIRED)
        const metadata = this.metadataEnricher.enrichParentMetadata(
          parent,
          documentMetadata,
        );

        // 2. Extract entities (algorithmic)
        const entities = entityExtractionEnabled
          ? this.entityExtractor.extractEntities(parent.content)
          : [];

        // Create enriched chunk
        const enrichedChunk: EnrichedParentChunk = {
          id: parent.id,
          documentId: parent.documentId,
          fileId: parent.fileId,
          content: parent.content, // NEVER modified
          tokens: parent.tokens, // NEVER modified
          chunkIndex: parent.chunkIndex,
          metadata: {
            ...metadata,
            entities,
            keywords: [], // Will be filled in second pass (batch)
          },
        };

        // Validate: Content and tokens MUST NOT change
        this.validateEnrichedChunk(parent, enrichedChunk);

        enriched.push(enrichedChunk);
      } catch (error) {
        this.logger.error(`Failed to enrich parent ${parent.id}:`, error);
        throw error; // Critical error - fail fast
      }
    }

    // Second pass: Batch keyword extraction (TF-IDF requires all chunks)
    if (keywordExtractionMethod === 'tfidf' && enriched.length > 0) {
      try {
        const keywordsMap = this.keywordExtractor.extractKeywords(enriched);

        enriched.forEach((chunk) => {
          chunk.metadata.keywords = keywordsMap.get(chunk.id) || [];
        });

        this.logger.log(
          `Extracted keywords for ${enriched.length} parent chunks using TF-IDF`,
        );
      } catch (error) {
        this.logger.error('Keyword extraction failed:', error);
        // Non-fatal - continue without keywords
      }
    }

    // Third pass: Optional LLM enrichments (summaries)
    if (this.llmEnricher.isEnabled()) {
      try {
        const summariesMap =
          await this.llmEnricher.batchGenerateSummaries(enriched);

        enriched.forEach((chunk) => {
          const summaryResult = summariesMap.get(chunk.id);
          if (summaryResult) {
            chunk.metadata.summary = summaryResult.summary;
          }
        });

        this.logger.log(
          `Generated summaries for ${summariesMap.size}/${enriched.length} parent chunks`,
        );
      } catch (error) {
        this.logger.error('LLM summary generation failed:', error);
        // Non-fatal - continue without summaries
      }
    }

    // Fourth pass: Optional hypothetical questions (Multi-Vector)
    if (this.hypotheticalQuestionsGenerator.isEnabled()) {
      try {
        const questionsMap =
          await this.hypotheticalQuestionsGenerator.batchGenerateQuestions(
            enriched,
          );

        enriched.forEach((chunk) => {
          const questionsResult = questionsMap.get(chunk.id);
          if (questionsResult) {
            chunk.metadata.hypotheticalQuestions = questionsResult.questions;
          }
        });

        this.logger.log(
          `Generated hypothetical questions for ${questionsMap.size}/${enriched.length} parent chunks`,
        );
      } catch (error) {
        this.logger.error('Hypothetical questions generation failed:', error);
        // Non-fatal - continue without questions
      }
    }

    return enriched;
  }

  /**
   * Enrich child chunks with algorithmic enrichments only (no LLM)
   */
  private enrichChildChunks(
    children: EnrichInputDto['childChunks'],
    parents: EnrichInputDto['parentChunks'],
    documentMetadata: {
      documentId: string;
      fileId: string;
      filename: string;
      documentType: 'pdf' | 'docx' | 'text' | 'code' | 'markdown';
    },
  ): EnrichedChildChunk[] {
    const enriched: EnrichedChildChunk[] = [];
    const entityExtractionEnabled =
      this.configService.get<boolean>('ENTITY_EXTRACTION_ENABLED') ?? true;

    // Create parent lookup
    const parentMap = new Map(parents.map((p) => [p.id, p]));

    for (const child of children) {
      try {
        const parent = parentMap.get(child.parentChunkId);
        if (!parent) {
          this.logger.error(
            `Parent chunk ${child.parentChunkId} not found for child ${child.id}`,
          );
          continue; // Skip orphan children
        }

        // 1. Add hierarchical metadata
        const metadata = this.metadataEnricher.enrichChildMetadata(
          child,
          parent,
          documentMetadata,
        );

        // 2. Extract entities (algorithmic) - children also have entities for filtering
        const entities = entityExtractionEnabled
          ? this.entityExtractor.extractEntities(child.content)
          : [];

        // Create enriched chunk
        const enrichedChunk: EnrichedChildChunk = {
          id: child.id,
          parentChunkId: child.parentChunkId,
          documentId: child.documentId,
          fileId: child.fileId,
          content: child.content, // NEVER modified
          tokens: child.tokens, // NEVER modified
          chunkIndex: child.chunkIndex,
          metadata: {
            ...metadata,
            entities,
            isOnlyChild: child.metadata.isOnlyChild,
          },
        };

        // Validate: Content and tokens MUST NOT change
        this.validateEnrichedChunk(child, enrichedChunk);

        enriched.push(enrichedChunk);
      } catch (error) {
        this.logger.error(`Failed to enrich child ${child.id}:`, error);
        throw error; // Critical error - fail fast
      }
    }

    return enriched;
  }

  /**
   * Validate enriched chunk - ensure content and tokens are unchanged
   */
  private validateEnrichedChunk(
    original: { content: string; tokens: number; id: string },
    enriched: { content: string; tokens: number; id: string },
  ): void {
    // CRITICAL: Content must be unchanged
    if (original.content !== enriched.content) {
      throw new ContentModifiedError(original.id);
    }

    // CRITICAL: Token count must be unchanged
    if (original.tokens !== enriched.tokens) {
      throw new TokenCountMismatchError(
        original.id,
        original.tokens,
        enriched.tokens,
      );
    }
  }

  /**
   * Calculate enrichment statistics
   */
  private calculateStatistics(
    parents: EnrichedParentChunk[],
    children: EnrichedChildChunk[],
  ): EnrichmentStatistics {
    const parentsWithEntities = parents.filter(
      (p) => p.metadata.entities && p.metadata.entities.length > 0,
    ).length;

    const parentsWithKeywords = parents.filter(
      (p) => p.metadata.keywords && p.metadata.keywords.length > 0,
    ).length;

    const parentsWithSummaries = parents.filter(
      (p) => p.metadata.summary,
    ).length;

    const parentsWithQuestions = parents.filter(
      (p) =>
        p.metadata.hypotheticalQuestions &&
        p.metadata.hypotheticalQuestions.length > 0,
    ).length;

    const totalEntities = [
      ...parents.map((p) => p.metadata.entities || []),
      ...children.map((c) => c.metadata.entities || []),
    ].reduce((sum, entities) => sum + entities.length, 0);

    const totalKeywords = parents.reduce(
      (sum, p) => sum + (p.metadata.keywords?.length || 0),
      0,
    );

    return {
      totalParents: parents.length,
      totalChildren: children.length,
      parentsWithEntities,
      parentsWithKeywords,
      parentsWithSummaries,
      parentsWithQuestions,
      averageEntitiesPerChunk:
        parents.length + children.length > 0
          ? totalEntities / (parents.length + children.length)
          : 0,
      averageKeywordsPerChunk:
        parents.length > 0 ? totalKeywords / parents.length : 0,
      llmTokensUsed: 0, // TODO: Calculate from summary and questions results
      durationMs: 0, // Will be set by orchestrator
    };
  }
}
