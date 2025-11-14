/**
 * Embed Stage Module
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmbeddingProviderFactory } from './embedding-provider.factory';
import { EmbeddingGenerationService } from './embedding-generation.service';
import { SparseEmbeddingService } from './sparse-embedding.service';
import { EmbedStageService } from './embed-stage.service';

@Module({
  imports: [ConfigModule],
  providers: [
    EmbeddingProviderFactory,
    EmbeddingGenerationService,
    SparseEmbeddingService,
    EmbedStageService,
  ],
  exports: [EmbedStageService, EmbeddingProviderFactory],
})
export class EmbedModule {}
