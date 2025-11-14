import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { OutboxModule } from '../outbox/outbox.module';
import { IndexingTcpClientModule } from '../common/modules/indexing-tcp-client.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    StorageModule,
    OutboxModule,
    IndexingTcpClientModule,
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
