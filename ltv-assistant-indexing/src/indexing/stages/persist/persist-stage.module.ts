/**
 * Persist Stage Module
 * Based on specs from docs/plans/persist-stage.md
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { MySQLPersistenceService } from './services/mysql-persistence.service';
import { QdrantPersistenceService } from './services/qdrant-persistence.service';
import { QdrantInitService } from './services/qdrant-init.service';
import { PersistStage } from './persist.stage';
import { QDRANT_CLIENT } from './persist.constants';
import { EmbedModule } from '../embed/embed.module';

@Module({
  imports: [ConfigModule, EmbedModule],
  providers: [
    // Qdrant Client Provider
    {
      provide: QDRANT_CLIENT,
      useFactory: (configService: ConfigService): QdrantClient => {
        const url =
          configService.get<string>('QDRANT_URL') || 'http://localhost:6333';

        const apiKey = configService.get<string>('QDRANT_API_KEY');

        return new QdrantClient({
          url,
          ...(apiKey && { apiKey }),
        });
      },
      inject: [ConfigService],
    },
    // Service providers
    MySQLPersistenceService,
    QdrantPersistenceService,
    QdrantInitService, // Auto-initialize Qdrant collections on startup
    PersistStage,
  ],
  exports: [PersistStage, MySQLPersistenceService, QdrantPersistenceService],
})
export class PersistStageModule {}
