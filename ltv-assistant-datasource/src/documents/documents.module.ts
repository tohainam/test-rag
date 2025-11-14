import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentsTcpController } from './documents-tcp.controller';
import { DatabaseModule } from '../database/database.module';
import { AuthTcpClientModule } from '../common/modules/auth-tcp-client.module';

@Module({
  imports: [ConfigModule, DatabaseModule, AuthTcpClientModule],
  controllers: [DocumentsController, DocumentsTcpController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
