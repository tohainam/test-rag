/**
 * Enrich Stage Module
 * Provides all enrichment services and orchestrator
 * Based on specs from docs/plans/enrich-stage.md
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EnrichStage } from './enrich.stage';
import {
  MetadataEnricherService,
  AlgorithmicEntityExtractorService,
  KeywordExtractorService,
  LLMProviderFactory,
  LlmEnricherService,
  HypotheticalQuestionsGeneratorService,
} from './services';

@Module({
  imports: [
    ConfigModule, // For accessing environment variables
  ],
  providers: [
    // Core orchestrator
    EnrichStage,

    // Algorithmic enrichment services (always enabled)
    MetadataEnricherService,
    AlgorithmicEntityExtractorService,
    KeywordExtractorService,

    // LLM infrastructure
    LLMProviderFactory,

    // Optional LLM enrichment services (enabled via config)
    LlmEnricherService,
    HypotheticalQuestionsGeneratorService,
  ],
  exports: [
    EnrichStage, // Export for use in workflow
  ],
})
export class EnrichStageModule {}
