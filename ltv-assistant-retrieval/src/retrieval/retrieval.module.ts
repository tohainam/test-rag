/**
 * Retrieval Module
 * Main module for retrieval service functionality
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../database/database.module';
import { WorkflowModule } from './workflow/workflow.module';
import { DatasourceTcpClientModule } from './clients/datasource-tcp-client.module';
import { EmbeddingProviderFactory } from './providers/embedding-provider.factory';
import { LLMProviderFactory } from './providers/llm-provider.factory';
import { QueryTransformationService } from './services/query-transformation.service';
import { QdrantService } from './services/qdrant.service';
import { QdrantCacheService } from './services/qdrant-cache.service';
import { CacheInvalidationService } from './services/cache-invalidation.service';
import { MySQLService } from './services/mysql.service';
import { RerankerService } from './services/reranker.service';
import { SparseEmbeddingService } from './services/sparse-embedding.service';
import { DatasourceClient } from './clients/datasource.client';
import { RetrievalController } from './retrieval.controller';
import { RetrievalTcpController } from './retrieval-tcp.controller';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    WorkflowModule,
    DatasourceTcpClientModule,
    ScheduleModule.forRoot(), // Enable cron jobs for cache invalidation
  ],
  providers: [
    // Provider factories
    EmbeddingProviderFactory,
    LLMProviderFactory,
    // Services
    QueryTransformationService,
    QdrantService,
    QdrantCacheService, // Phase 1.5: Semantic cache service
    CacheInvalidationService, // Phase 1.5: Cache cleanup and invalidation
    MySQLService,
    RerankerService,
    SparseEmbeddingService,
    // Clients
    DatasourceClient,
  ],
  controllers: [RetrievalController, RetrievalTcpController, AdminController],
  exports: [],
})
export class RetrievalModule {}
