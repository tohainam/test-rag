import { Module } from '@nestjs/common';
import { LoadStage } from './load.stage';
import { StorageModule } from '../../../storage/storage.module';
import { StreamingService } from './services/streaming.service';

@Module({
  imports: [StorageModule],
  providers: [LoadStage, StreamingService],
  exports: [LoadStage],
})
export class LoadStageModule {}
