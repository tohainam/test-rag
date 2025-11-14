import { Module } from '@nestjs/common';
import { ChunkStage } from './chunk.stage';
import {
  TokenCounterService,
  ChunkIdGeneratorService,
  ParentChunkSplitterService,
  ChildChunkSplitterService,
  LineageBuilderService,
  LineageValidatorService,
} from './services';

/**
 * Chunk Stage Module
 * Provides chunking services for the indexing pipeline
 */
@Module({
  providers: [
    // Core stage
    ChunkStage,

    // Services
    TokenCounterService,
    ChunkIdGeneratorService,
    ParentChunkSplitterService,
    ChildChunkSplitterService,
    LineageBuilderService,
    LineageValidatorService,
  ],
  exports: [ChunkStage],
})
export class ChunkStageModule {}
