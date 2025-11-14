/**
 * Workflow Module
 * Provides RetrievalWorkflowService with all required dependencies
 * Includes TCP client configuration for datasource service
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RetrievalWorkflowService } from './retrieval-workflow.service';
import { EmbeddingProviderFactory } from '../providers/embedding-provider.factory';
import { LLMProviderFactory } from '../providers/llm-provider.factory';
import { QueryTransformationService } from '../services/query-transformation.service';
import { QdrantService } from '../services/qdrant.service';
import { QdrantCacheService } from '../services/qdrant-cache.service';
import { MySQLService } from '../services/mysql.service';
import { RerankerService } from '../services/reranker.service';
import { SparseEmbeddingService } from '../services/sparse-embedding.service';
import { DatasourceClient } from '../clients/datasource.client';

@Module({
  imports: [
    // TCP client for datasource service
    ClientsModule.registerAsync([
      {
        name: 'DATASOURCE_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host:
              configService.get<string>('DATASOURCE_SERVICE_HOST') ||
              'localhost',
            port:
              configService.get<number>('DATASOURCE_SERVICE_TCP_PORT') || 4004,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [
    // Workflow service
    RetrievalWorkflowService,

    // Clients
    DatasourceClient,

    // Factories
    EmbeddingProviderFactory,
    LLMProviderFactory,

    // Services
    QueryTransformationService,
    QdrantService,
    QdrantCacheService,
    MySQLService,
    RerankerService,
    SparseEmbeddingService,
  ],
  exports: [RetrievalWorkflowService],
})
export class WorkflowModule {}
