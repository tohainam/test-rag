/**
 * Cache Configuration Module
 * Global caching using @nestjs/cache-manager with Keyv Redis adapter
 * Replaces custom RedisService for NestJS ecosystem compliance
 */

import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Build Redis URL from config
        const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
        const redisPort = configService.get<number>('REDIS_PORT', 6379);
        const redisPassword = configService.get<string>('REDIS_PASSWORD');
        const redisDb = configService.get<number>('REDIS_DB', 0);

        // Use REDIS_URL if provided, otherwise construct from parts
        const redisUrl =
          configService.get<string>('REDIS_URL') ||
          (redisPassword
            ? `redis://:${redisPassword}@${redisHost}:${redisPort}/${redisDb}`
            : `redis://${redisHost}:${redisPort}/${redisDb}`);

        // Create Keyv instance with Redis adapter
        const store = new Keyv({
          store: new KeyvRedis(redisUrl),
          namespace: 'ltv-retrieval', // Prefix all keys
        });

        // Get TTL from config (convert seconds to milliseconds)
        const ttlSeconds = configService.get<number>('REDIS_CACHE_TTL', 3600);
        const ttlMs = ttlSeconds * 1000;

        return {
          store: () => store,
          ttl: ttlMs,
        };
      },
      isGlobal: true, // Make cache available globally
    }),
  ],
  exports: [CacheModule],
})
export class CacheConfigModule {}
