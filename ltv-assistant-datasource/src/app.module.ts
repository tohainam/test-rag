import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { OutboxModule } from './outbox/outbox.module';
import { DocumentsModule } from './documents/documents.module';
import { FilesModule } from './files/files.module';
import { QueueModule } from './queue/queue.module';
import { RequestIdMiddleware } from './shared/middleware/request-id.middleware';
import { pinoConfig } from './shared/logging/pino.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LoggerModule.forRoot(pinoConfig),
    DatabaseModule,
    StorageModule,
    QueueModule,
    OutboxModule, // Outbox Pattern for reliable message delivery
    DocumentsModule,
    FilesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
