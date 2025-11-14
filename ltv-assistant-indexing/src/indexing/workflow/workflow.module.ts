import { Module } from '@nestjs/common';
import { IndexingWorkflowService } from './indexing-workflow.service';
import { LoadStageModule } from '../stages/load/load-stage.module';
import { ParseStageModule } from '../stages/parse/parse-stage.module';
import { StructureStageModule } from '../stages/structure';
import { ChunkStageModule } from '../stages/chunk';
import { EnrichStageModule } from '../stages/enrich';
import { EmbedModule } from '../stages/embed';
import { PersistStageModule } from '../stages/persist';

@Module({
  imports: [
    LoadStageModule,
    ParseStageModule,
    StructureStageModule,
    ChunkStageModule,
    EnrichStageModule,
    EmbedModule,
    PersistStageModule,
  ],
  providers: [IndexingWorkflowService],
  exports: [IndexingWorkflowService],
})
export class WorkflowModule {}
