# LTV Assistant Indexing Service - Folder Structure

**Version:** 1.0
**Last Updated:** 2025-11-03
**Status:** Draft

---

## Overview

This document defines the complete folder structure for the LTV Assistant Indexing Service, a NestJS microservice built with LangChain.js and LangGraph.js for document processing and semantic search indexing.

---

## Root Structure

```
ltv-assistant-indexing/
├── src/                          # Source code
├── test/                         # Test files
├── docs/                         # Service-specific documentation
├── scripts/                      # Utility scripts
├── drizzle/                      # Database migrations & schema
├── .env.example                  # Environment variables template
├── .env                          # Environment variables (gitignored)
├── .eslintrc.js                  # ESLint configuration
├── .prettierrc                   # Prettier configuration
├── tsconfig.json                 # TypeScript configuration
├── nest-cli.json                 # NestJS CLI configuration
├── package.json                  # Dependencies
├── pnpm-lock.yaml               # Lock file
├── Dockerfile                    # Docker image definition
├── docker-compose.yml            # Local development compose
└── README.md                     # Service README
```

---

## Detailed Source Structure

```
src/
├── main.ts                       # Application entry point
├── app.module.ts                 # Root application module
│
├── config/                       # Configuration management
│   ├── config.module.ts          # Config module
│   ├── config.service.ts         # Config service with validation
│   ├── types/
│   │   ├── indexing-config.type.ts       # Indexing configuration types
│   │   ├── chunking-config.type.ts       # Chunking parameters
│   │   ├── embedding-config.type.ts      # Embedding parameters
│   │   ├── storage-config.type.ts        # Storage backends config
│   │   └── enrichment-config.type.ts     # Enrichment options
│   └── schemas/
│       ├── env-validation.schema.ts      # Zod/Joi schema for env vars
│       └── config-override.schema.ts     # Document type overrides
│
├── common/                       # Shared utilities & types
│   ├── constants/
│   │   ├── job-status.constant.ts        # Job status enum
│   │   ├── stage.constant.ts             # Pipeline stage enum
│   │   ├── error-codes.constant.ts       # Error code definitions
│   │   └── mime-types.constant.ts        # Supported MIME types
│   ├── decorators/
│   │   ├── retry.decorator.ts            # Retry logic decorator
│   │   └── measure-time.decorator.ts     # Performance measurement
│   ├── filters/
│   │   ├── http-exception.filter.ts      # HTTP error handler
│   │   └── rpc-exception.filter.ts       # TCP error handler
│   ├── interceptors/
│   │   ├── logging.interceptor.ts        # Request/response logging
│   │   └── transform.interceptor.ts      # Response transformation
│   ├── pipes/
│   │   └── validation.pipe.ts            # Custom validation pipe
│   ├── guards/
│   │   └── auth.guard.ts                 # Authentication guard (future)
│   └── utils/
│       ├── id-generator.util.ts          # Content-based ID generation
│       ├── hash.util.ts                  # Hashing utilities
│       ├── token-counter.util.ts         # Token counting
│       ├── retry.util.ts                 # Retry with backoff
│       └── validation.util.ts            # Validation helpers
│
├── core/                         # Core business logic
│   ├── workflow/                 # LangGraph.js workflow
│   │   ├── workflow.module.ts            # Workflow module
│   │   ├── workflow.service.ts           # Workflow orchestrator
│   │   ├── state/
│   │   │   ├── indexing-state.ts         # StateGraph definition
│   │   │   └── state-types.ts            # State shape types
│   │   ├── nodes/                        # Workflow nodes (stages)
│   │   │   ├── load.node.ts              # Stage 1: Load
│   │   │   ├── parse.node.ts             # Stage 2: Parse
│   │   │   ├── structure.node.ts         # Stage 3: Structure
│   │   │   ├── chunk.node.ts             # Stage 4: Chunk
│   │   │   ├── enrich.node.ts            # Stage 5: Enrich
│   │   │   ├── embed.node.ts             # Stage 6: Embed
│   │   │   └── persist.node.ts           # Stage 7: Persist
│   │   ├── graph/
│   │   │   ├── graph-builder.ts          # StateGraph construction
│   │   │   └── graph-executor.ts         # Graph execution logic
│   │   └── types/
│   │       ├── workflow-input.type.ts    # Workflow input interface
│   │       └── workflow-result.type.ts   # Workflow result interface
│   │
│   ├── stages/                   # Stage implementations
│   │   ├── load/
│   │   │   ├── load.module.ts
│   │   │   ├── load.service.ts           # MinIO file loading
│   │   │   ├── loaders/
│   │   │   │   ├── minio.loader.ts       # MinIO integration
│   │   │   │   └── s3.loader.ts          # S3 API client
│   │   │   └── types/
│   │   │       └── load-result.type.ts
│   │   │
│   │   ├── parse/
│   │   │   ├── parse.module.ts
│   │   │   ├── parse.service.ts          # Document parsing orchestrator
│   │   │   ├── parsers/
│   │   │   │   ├── pdf.parser.ts         # PDFLoader wrapper
│   │   │   │   ├── docx.parser.ts        # DocxLoader wrapper
│   │   │   │   ├── text.parser.ts        # TextLoader wrapper
│   │   │   │   ├── code.parser.ts        # Code file parser
│   │   │   │   └── parser.factory.ts     # Parser selection by MIME type
│   │   │   └── types/
│   │   │       ├── parse-result.type.ts
│   │   │       └── document.type.ts      # LangChain Document interface
│   │   │
│   │   ├── structure/
│   │   │   ├── structure.module.ts
│   │   │   ├── structure.service.ts      # Hierarchy building
│   │   │   ├── builders/
│   │   │   │   ├── hierarchy.builder.ts  # Document tree construction
│   │   │   │   ├── heading.detector.ts   # Heading pattern detection
│   │   │   │   └── section.tracker.ts    # Section stack management
│   │   │   └── types/
│   │   │       ├── structured-doc.type.ts
│   │   │       └── hierarchy-node.type.ts
│   │   │
│   │   ├── chunk/
│   │   │   ├── chunk.module.ts
│   │   │   ├── chunk.service.ts          # Small-to-Big chunking
│   │   │   ├── splitters/
│   │   │   │   ├── parent.splitter.ts    # Parent chunk splitter
│   │   │   │   ├── child.splitter.ts     # Child chunk splitter
│   │   │   │   └── splitter.factory.ts   # RecursiveCharacterTextSplitter setup
│   │   │   ├── lineage/
│   │   │   │   └── lineage-mapper.ts     # Parent-child mapping
│   │   │   └── types/
│   │   │       ├── chunk-result.type.ts
│   │   │       ├── parent-chunk.type.ts
│   │   │       ├── child-chunk.type.ts
│   │   │       └── lineage.type.ts
│   │   │
│   │   ├── enrich/
│   │   │   ├── enrich.module.ts
│   │   │   ├── enrich.service.ts         # Metadata enrichment orchestrator
│   │   │   ├── enrichers/
│   │   │   │   ├── metadata.enricher.ts  # Hierarchical metadata
│   │   │   │   ├── entity.enricher.ts    # Named entity extraction
│   │   │   │   ├── summary.enricher.ts   # LLM-based summarization (optional)
│   │   │   │   └── keyword.enricher.ts   # Keyword extraction (optional)
│   │   │   ├── extractors/
│   │   │   │   ├── algorithmic-entity.extractor.ts  # Rule-based NER
│   │   │   │   └── llm-entity.extractor.ts          # LLM-based NER
│   │   │   └── types/
│   │   │       ├── enrichment-result.type.ts
│   │   │       ├── enriched-chunk.type.ts
│   │   │       └── entity-link.type.ts
│   │   │
│   │   ├── embed/
│   │   │   ├── embed.module.ts
│   │   │   ├── embed.service.ts          # Embedding generation
│   │   │   ├── embedders/
│   │   │   │   ├── ollama.embedder.ts    # Ollama HTTP API client
│   │   │   │   ├── batch.embedder.ts     # Batch processing logic
│   │   │   │   └── sparse.embedder.ts    # BM25 sparse embeddings (optional)
│   │   │   ├── clients/
│   │   │   │   └── ollama.client.ts      # HTTP client for Ollama
│   │   │   └── types/
│   │   │       ├── embedding-result.type.ts
│   │   │       ├── dense-vector.type.ts
│   │   │       └── sparse-vector.type.ts
│   │   │
│   │   └── persist/
│   │       ├── persist.module.ts
│   │       ├── persist.service.ts        # Multi-store coordinator
│   │       ├── persisters/
│   │       │   ├── mysql.persister.ts    # MySQL chunk storage
│   │       │   ├── qdrant.persister.ts   # Qdrant vector storage
│   │       ├── rollback/
│   │       │   ├── rollback.manager.ts   # Rollback orchestrator
│   │       │   ├── mysql.rollback.ts     # MySQL transaction rollback
│   │       │   ├── qdrant.rollback.ts    # Qdrant point deletion
│   │       └── types/
│   │           ├── persist-result.type.ts
│   │           └── rollback-state.type.ts
│   │
│   └── job/                      # Job management
│       ├── job.module.ts
│       ├── job.service.ts                # Job CRUD operations
│       ├── job.processor.ts              # BullMQ processor
│       ├── job.producer.ts               # Job creation
│       └── types/
│           ├── job-data.type.ts          # Job payload
│           ├── job-status.type.ts        # Status tracking
│           └── job-metrics.type.ts       # Performance metrics
│
├── database/                     # Database integrations
│   ├── mysql/
│   │   ├── mysql.module.ts
│   │   ├── mysql.service.ts              # Drizzle ORM wrapper
│   │   ├── schema/
│   │   │   ├── indexing-jobs.schema.ts   # Job tracking table
│   │   │   ├── parent-chunks.schema.ts   # Parent chunks table
│   │   │   ├── child-chunks.schema.ts    # Child chunks table
│   │   │   └── chunk-lineage.schema.ts   # Lineage mapping table
│   │   ├── repositories/
│   │   │   ├── job.repository.ts         # Job CRUD
│   │   │   ├── parent-chunk.repository.ts
│   │   │   ├── child-chunk.repository.ts
│   │   │   └── lineage.repository.ts
│   │   └── types/
│   │       └── db-types.ts               # Inferred types from schema
│   │
│   ├── qdrant/
│   │   ├── qdrant.module.ts
│   │   ├── qdrant.service.ts             # Qdrant client wrapper
│   │   ├── collection/
│   │   │   ├── collection.manager.ts     # Collection CRUD
│   │   │   └── collection.config.ts      # Collection schema
│   │   ├── operations/
│   │   │   ├── upsert.operation.ts       # Vector upsert
│   │   │   ├── delete.operation.ts       # Point deletion
│   │   │   └── search.operation.ts       # Vector search (for validation)
│   │   └── types/
│   │       ├── point.type.ts             # Qdrant point structure
│   │       └── payload.type.ts           # Payload schema
│   │
│       ├── graph/
│       │   ├── document.graph.ts         # Document node operations
│       │   ├── chunk.graph.ts            # Chunk node operations
│       │   ├── entity.graph.ts           # Entity node operations
│       │   └── relationship.graph.ts     # Relationship creation
│       ├── queries/
│       │   ├── create-nodes.cypher.ts    # Cypher query builders
│       │   ├── create-rels.cypher.ts
│       │   └── delete-graph.cypher.ts    # Cleanup queries
│       └── types/
│           ├── node.type.ts              # Node types
│           └── relationship.type.ts      # Relationship types
│
├── integrations/                 # External service integrations
│   ├── minio/
│   │   ├── minio.module.ts
│   │   ├── minio.service.ts              # MinIO S3 client
│   │   ├── operations/
│   │   │   ├── get-file.operation.ts     # File retrieval
│   │   │   └── get-metadata.operation.ts # Metadata retrieval
│   │   └── types/
│   │       └── file-metadata.type.ts
│   │
│   ├── datasource/
│   │   ├── datasource.module.ts
│   │   ├── datasource.client.ts          # TCP client to datasource service
│   │   └── types/
│   │       └── datasource-response.type.ts
│   │
│   ├── ollama/
│   │   ├── ollama.module.ts
│   │   ├── ollama.service.ts             # Ollama API client
│   │   └── types/
│   │       └── ollama-response.type.ts
│   │
│   └── langchain/
│       ├── langchain.module.ts
│       ├── loaders/
│       │   └── loader.registry.ts        # LangChain loader registry
│       ├── splitters/
│       │   └── splitter.config.ts        # Splitter configurations
│       └── embeddings/
│           └── ollama-embeddings.ts      # Custom Ollama Embeddings class
│
├── api/                          # API layer
│   ├── http/
│   │   ├── http.module.ts
│   │   ├── controllers/
│   │   │   └── health.controller.ts      # Health check endpoint
│   │   └── dto/
│   │       └── health-response.dto.ts
│   │
│   └── tcp/
│       ├── tcp.module.ts
│       ├── controllers/
│       │   └── indexing.controller.ts    # TCP endpoints
│       └── dto/
│           ├── get-status.dto.ts         # Input DTO
│           └── status-response.dto.ts    # Output DTO
│
├── queue/                        # BullMQ queue management
│   ├── queue.module.ts
│   ├── queue.service.ts                  # Queue operations
│   ├── queues/
│   │   └── file-indexing.queue.ts        # Queue definition
│   ├── processors/
│   │   └── file-indexing.processor.ts    # Job processor
│   └── types/
│       ├── queue-config.type.ts
│       └── job-options.type.ts
│
├── monitoring/                   # Logging & monitoring
│   ├── monitoring.module.ts
│   ├── logger/
│   │   ├── logger.service.ts             # Structured logging
│   │   └── logger.config.ts              # Winston/Pino config
│   ├── metrics/
│   │   ├── metrics.service.ts            # Prometheus metrics
│   │   └── metrics.collector.ts          # Custom metric collectors
│   └── tracing/
│       └── tracing.service.ts            # OpenTelemetry (future)
│
└── types/                        # Global type definitions
    ├── index.ts                          # Type exports
    ├── global.d.ts                       # Global type declarations
    └── errors/
        ├── indexing-error.ts             # Base error class
        ├── temporary-error.ts            # Retryable errors
        ├── permanent-error.ts            # Non-retryable errors
        └── resource-error.ts             # Resource exhaustion errors
```

---

## Test Structure

```
test/
├── unit/                         # Unit tests
│   ├── config/
│   │   └── config.service.spec.ts
│   ├── stages/
│   │   ├── load.service.spec.ts
│   │   ├── parse.service.spec.ts
│   │   ├── structure.service.spec.ts
│   │   ├── chunk.service.spec.ts
│   │   ├── enrich.service.spec.ts
│   │   ├── embed.service.spec.ts
│   │   └── persist.service.spec.ts
│   ├── workflow/
│   │   ├── workflow.service.spec.ts
│   │   └── graph-executor.spec.ts
│   ├── database/
│   │   ├── mysql.service.spec.ts
│   │   ├── qdrant.service.spec.ts
│   └── utils/
│       ├── id-generator.util.spec.ts
│       ├── token-counter.util.spec.ts
│       └── retry.util.spec.ts
│
├── integration/                  # Integration tests
│   ├── workflow/
│   │   └── full-pipeline.integration.spec.ts
│   ├── database/
│   │   ├── mysql-transaction.integration.spec.ts
│   │   ├── qdrant-upsert.integration.spec.ts
│   ├── queue/
│   │   └── bullmq-processing.integration.spec.ts
│   └── api/
│       └── tcp-endpoints.integration.spec.ts
│
├── e2e/                          # End-to-end tests
│   ├── indexing-workflow.e2e.spec.ts
│   ├── job-lifecycle.e2e.spec.ts
│   └── rollback.e2e.spec.ts
│
├── performance/                  # Performance tests
│   ├── load-test.perf.spec.ts            # 100 concurrent jobs
│   ├── large-doc.perf.spec.ts            # 50MB+ documents
│   └── embedding.perf.spec.ts            # Batch embedding speed
│
├── fixtures/                     # Test data
│   ├── documents/
│   │   ├── sample.pdf
│   │   ├── sample.docx
│   │   ├── sample.txt
│   │   └── sample.md
│   ├── mocks/
│   │   ├── ollama-response.mock.ts
│   │   ├── qdrant-response.mock.ts
│   │   └── minio-response.mock.ts
│   └── factories/
│       ├── chunk.factory.ts
│       ├── document.factory.ts
│       └── job.factory.ts
│
└── helpers/
    ├── test-container.ts                 # Docker test containers
    ├── database.helper.ts                # DB setup/teardown
    └── cleanup.helper.ts                 # Test cleanup utilities
```

---

## Scripts Structure

```
scripts/
├── setup/
│   ├── setup-dev.sh                      # Local development setup
│   ├── setup-ollama.sh                   # Pull Ollama models
│   ├── setup-qdrant.sh                   # Create Qdrant collections
│
├── migration/
│   ├── generate-migration.ts             # Drizzle migration generator
│   ├── run-migrations.ts                 # Apply migrations
│   └── rollback-migration.ts             # Rollback last migration
│
├── seed/
│   └── seed-test-data.ts                 # Seed test documents
│
└── utils/
    ├── test-indexing.ts                  # Manual indexing test
    ├── clear-queue.ts                    # Clear BullMQ queue
    └── reindex-documents.ts              # Bulk reindexing script
```

---

## Drizzle Structure

```
drizzle/
├── meta/                         # Migration metadata (auto-generated)
├── migrations/                   # SQL migration files (auto-generated)
│   ├── 0001_create_indexing_jobs.sql
│   ├── 0002_create_parent_chunks.sql
│   ├── 0003_create_child_chunks.sql
│   └── 0004_create_chunk_lineage.sql
│
├── schema/                       # Schema source files
│   ├── indexing-jobs.ts
│   ├── parent-chunks.ts
│   ├── child-chunks.ts
│   └── chunk-lineage.ts
│
└── drizzle.config.ts             # Drizzle configuration
```

---

## Documentation Structure

```
docs/
├── architecture/
│   ├── workflow-design.md                # LangGraph.js workflow architecture
│   ├── stage-specifications.md           # Detailed stage specs
│   └── storage-design.md                 # Multi-store strategy
│
├── api/
│   ├── tcp-api.md                        # TCP endpoint documentation
│   └── http-api.md                       # HTTP endpoint documentation
│
├── guides/
│   ├── development-setup.md              # Local dev setup
│   ├── testing-guide.md                  # Testing strategies
│   ├── deployment-guide.md               # Docker deployment
│   └── configuration-guide.md            # Config management
│
├── integrations/
│   ├── ollama-integration.md             # Ollama setup & usage
│   ├── qdrant-integration.md             # Qdrant configuration
│   └── langchain-usage.md                # LangChain.js patterns
│
└── diagrams/
    ├── workflow-flow.mermaid              # Workflow diagram
    ├── architecture.mermaid               # System architecture
    └── data-model.mermaid                 # Database schema diagram
```

---

## Configuration Files

### Environment Variables (.env.example)

```bash
# Service Configuration
PORT=50055
TCP_PORT=4005
NODE_ENV=development

# Database
DB_HOST=mysql
DB_PORT=3306
DB_NAME=ltv_assistant_indexing_db
DB_USER=root
DB_PASSWORD=password

# Redis (BullMQ)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# MinIO
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false

# Qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=documents


# Ollama
OLLAMA_URL=http://ollama:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Chunking Configuration
CHUNK_PARENT_SIZE=4800
CHUNK_PARENT_OVERLAP=800
CHUNK_CHILD_SIZE=1600
CHUNK_CHILD_OVERLAP=200

# Embedding Configuration
EMBEDDING_BATCH_SIZE=30
SPARSE_EMBEDDINGS_ENABLED=false

# Enrichment Configuration
LLM_ENRICHMENT_ENABLED=false
ENTITY_EXTRACTION_ENABLED=true
SUMMARY_GENERATION_ENABLED=false
KEYWORD_EXTRACTION_ENABLED=false

# Job Configuration
CONCURRENT_WORKERS=5
JOB_TIMEOUT_MS=600000
MAX_JOB_ATTEMPTS=3

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

---

## Key Design Principles

### 1. Modularity
- Each stage is a separate module with clear boundaries
- Easy to swap implementations (e.g., different parsers, embedders)
- Minimal coupling between modules

### 2. Type Safety
- Strict TypeScript with no `any` or `as` usage
- Comprehensive type definitions for all interfaces
- Zod/Joi validation for runtime type checking

### 3. Testability
- Clear separation of concerns
- Dependency injection throughout
- Mock-friendly interfaces
- Comprehensive test fixtures

### 4. Observability
- Structured logging at every stage
- Performance metrics collection
- Error tracking with context
- Distributed tracing ready

### 5. Scalability
- Stateless workflow execution
- Horizontal scaling ready
- Efficient batch processing
- Resource-aware error handling

### 6. Maintainability
- Clear folder hierarchy
- Consistent naming conventions
- Comprehensive documentation
- Self-documenting code structure

---

## File Naming Conventions

### Services
- Pattern: `{feature}.service.ts`
- Example: `chunk.service.ts`, `embed.service.ts`

### Modules
- Pattern: `{feature}.module.ts`
- Example: `workflow.module.ts`, `mysql.module.ts`

### Controllers
- Pattern: `{feature}.controller.ts`
- Example: `health.controller.ts`, `indexing.controller.ts`

### Types
- Pattern: `{description}.type.ts`
- Example: `chunk-result.type.ts`, `job-data.type.ts`

### DTOs
- Pattern: `{feature}.dto.ts`
- Example: `get-status.dto.ts`, `status-response.dto.ts`

### Repositories
- Pattern: `{entity}.repository.ts`
- Example: `job.repository.ts`, `parent-chunk.repository.ts`

### Tests
- Pattern: `{feature}.spec.ts` (unit), `{feature}.integration.spec.ts` (integration), `{feature}.e2e.spec.ts` (e2e)
- Example: `chunk.service.spec.ts`, `workflow.integration.spec.ts`

---

## Module Import Order

1. Node.js built-in modules
2. External dependencies (@nestjs, @langchain, etc.)
3. Internal modules (from `src/`)
4. Types (from `./types` or `../types`)
5. Constants (from `./constants` or `../constants`)

Example:
```typescript
import { readFile } from 'fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ConfigService } from '@/config/config.service';
import { ChunkResult } from './types/chunk-result.type';
import { CHUNK_SEPARATORS } from './constants/separators.constant';
```

---

## Future Expansions

### Phase 2: Advanced Features
```
src/
├── core/
│   ├── stages/
│   │   ├── ocr/                  # OCR for scanned documents
│   │   ├── translate/            # Multi-language translation
│   │   └── fine-tune/            # Custom embedding fine-tuning
│   └── incremental/
│       └── delta-indexing/       # Incremental updates
```

### Phase 3: Optimization
```
src/
├── cache/
│   ├── embedding-cache/          # Redis-based embedding cache
│   └── chunk-cache/              # Deduplicated chunk storage
└── optimization/
    ├── batch-optimizer/          # Dynamic batch sizing
    └── gpu-scheduler/            # GPU resource management
```

---

## Summary

This folder structure provides:

1. **Clear Separation**: Each layer (API, core, database, integrations) is isolated
2. **Stage-Based Organization**: 7 stages are separate modules with dedicated implementations
3. **Comprehensive Testing**: Unit, integration, e2e, and performance tests
4. **Type Safety**: Explicit type definitions for all data structures
5. **Scalability**: Ready for horizontal scaling and feature additions
6. **Maintainability**: Self-documenting structure with clear conventions

The structure follows NestJS best practices while accommodating the unique requirements of the LangChain.js/LangGraph.js workflow architecture defined in the PRD.

---

**Status:** Draft
**Next Review:** 2025-11-10
**Version History:**
- v1.0 (2025-11-03): Initial folder structure

---

**End of Document**
