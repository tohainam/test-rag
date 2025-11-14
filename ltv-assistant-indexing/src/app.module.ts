import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './queue/queue.module';
import { IndexingModule } from './indexing/indexing.module';
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
    QueueModule,
    IndexingModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
