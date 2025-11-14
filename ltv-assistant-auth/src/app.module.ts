import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PersonalTokensModule } from './personal-tokens/personal-tokens.module';
import { RefreshTokensModule } from './refresh-tokens/refresh-tokens.module';
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
    AuthModule,
    UsersModule,
    PersonalTokensModule,
    RefreshTokensModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
