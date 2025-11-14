import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AuthTcpClientModule } from './auth/auth-tcp-client.module';
import { AuthMiddleware } from './auth/auth.middleware';
import { BullBoardConfigModule } from './bull-board/bull-board.module';
import { McpModule } from './mcp/mcp.module.js';
import { RequestIdMiddleware } from './shared/middleware/request-id.middleware';
import { pinoConfig } from './shared/logging/pino.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LoggerModule.forRoot(pinoConfig),
    AuthTcpClientModule,
    BullBoardConfigModule,
    McpModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, AuthMiddleware)
      .exclude('mcp/(.*)')
      .forRoutes('*');
  }
}
