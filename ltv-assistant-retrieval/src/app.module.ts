import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { RequestIdMiddleware } from './shared/middleware/request-id.middleware';
import { pinoConfig } from './shared/logging/pino.config';
import { DatabaseModule } from './database/database.module';
import { CacheConfigModule } from './common/cache/cache.module';
import { CommonModule } from './common/common.module';
import { RetrievalModule } from './retrieval/retrieval.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LoggerModule.forRoot(pinoConfig),
    CacheConfigModule,
    DatabaseModule,
    CommonModule,
    RetrievalModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
