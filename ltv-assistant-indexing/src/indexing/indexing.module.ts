import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { IndexingProcessor } from './indexing.processor';
import { IndexingService } from './indexing.service';
import { IndexingTcpController } from './indexing-tcp.controller';
import { DatabaseModule } from '../database/database.module';
import { WorkflowModule } from './workflow/workflow.module';
import { PersistStageModule } from './stages/persist/persist-stage.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    BullModule.registerQueue({
      name: 'file-indexing',
    }),
    WorkflowModule,
    PersistStageModule,
  ],
  controllers: [IndexingTcpController],
  providers: [IndexingService, IndexingProcessor],
  exports: [IndexingService],
})
export class IndexingModule {}
