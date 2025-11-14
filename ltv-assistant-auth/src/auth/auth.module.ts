import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthTcpController } from './auth-tcp.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PersonalTokenStrategy } from './strategies/personal-token.strategy';
import { DatabaseModule } from '../database/database.module';
import { PersonalTokensModule } from '../personal-tokens/personal-tokens.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    DatabaseModule,
    PersonalTokensModule,
    UsersModule,
    PassportModule.register({ session: true }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || '',
        signOptions: {
          expiresIn: '5m',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, AuthTcpController],
  providers: [AuthService, GoogleStrategy, JwtStrategy, PersonalTokenStrategy],
  exports: [AuthService],
})
export class AuthModule {}
