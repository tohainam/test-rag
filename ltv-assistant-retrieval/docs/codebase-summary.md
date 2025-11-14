# LTV Assistant Retrieval Service - Codebase Summary

## High-Level Codebase Structure

The ltv-assistant-retrieval service is organized as a NestJS microservice with a modular, layered architecture. The codebase follows enterprise patterns with clear separation of concerns, strong typing, and comprehensive dependency injection.

```
ltv-assistant-retrieval/
├── src/                          # Source code
│   ├── app.module.ts            # Root application module
│   ├── main.ts                  # Application bootstrap
│   ├── common/                  # Shared utilities and guards
│   ├── database/                # Database configuration and schemas
│   ├── retrieval/               # Core retrieval domain
│   │   ├── workflow/           # LangGraph workflow implementation
│   │   ├── services/           # Business logic services
│   │   ├── providers/          # LLM and embedding providers
│   │   ├── clients/            # External service clients
│   │   ├── dto/                # Data transfer objects
│   │   └── types/              # TypeScript type definitions
│   └── shared/                  # Cross-cutting concerns
│       ├── logging/            # Pino logger configuration
│       ├── middleware/         # Request middleware
│       ├── reranker/           # Reranker client
│       └── tracing/            # OpenTelemetry tracing
├── docs/                        # Documentation
├── test/                        # E2E tests
├── dist/                        # Compiled output
└── node_modules/                # Dependencies
```

## Key Directories and Their Purposes

### /src/common - Shared Application Components

**Purpose**: Provides common utilities, decorators, guards, and constants used across the application.

**Key Files**:
- `cache/cache.module.ts`: Redis cache configuration
- `decorators/current-user.decorator.ts`: Extract user from request context
- `decorators/roles.decorator.ts`: Role-based access control decorator
- `guards/gateway-auth.guard.ts`: Authentication guard for gateway requests
- `guards/roles.guard.ts`: Authorization guard for role checking
- `constants/roles.constant.ts`: User role definitions (SUPER_ADMIN, ADMIN, USER)
- `interfaces/request.interface.ts`: Augmented request type with user context

**Dependencies**: NestJS core, cache-manager, ioredis

### /src/database - Database Layer

**Purpose**: Manages database connections and schema definitions for MySQL storage.

**Key Files**:
- `database.module.ts`: Drizzle ORM configuration and connection pooling
- `schema.ts`: Table schemas for parent_chunks, child_chunks, chunk_lineage

**Database Schema**:
```typescript
// READ-ONLY schema - Source of truth in ltv-assistant-indexing
parentChunks: {
  id: varchar(255) PK
  fileId: varchar(255) FK -> datasource.files
  content: text (~1800 tokens)
  tokens: int
  chunkIndex: int
  metadata: json
  createdAt: timestamp
}

childChunks: {
  id: varchar(255) PK
  fileId: varchar(255) FK -> datasource.files
  parentChunkId: varchar(255) FK -> parent_chunks
  content: text (~512 tokens)
  tokens: int
  chunkIndex: int
  metadata: json
  createdAt: timestamp
}

chunkLineage: {
  id: int PK auto_increment
  parentChunkId: varchar(255) FK
  childChunkId: varchar(255) FK
  childOrder: int
  createdAt: timestamp
}
```

**Pattern**: Read-only access. Indexing service writes, retrieval service reads.

### /src/retrieval - Core Retrieval Domain

**Purpose**: Implements the main retrieval functionality including workflow orchestration, services, and business logic.

#### /src/retrieval/workflow - LangGraph Workflow

**Purpose**: Orchestrates the retrieval pipeline using LangGraph state machine.

**Key Files**:
- `retrieval-workflow.service.ts`: Main workflow service, graph construction with conditional routing
- `state/retrieval-state.ts`: State definition with 40+ fields (includes subQueryResults, decompositionTriggered)
- `nodes/check-cache.node.ts`: Phase 1.5 - Semantic cache lookup
- `nodes/analyze-query.node.ts`: Phase 4 - Query transformation (reformulation, rewrite, HyDE, decomposition)
- `nodes/build-access-filter.node.ts`: Phase 5 - RBAC filter construction
- `nodes/hybrid-retrieval.node.ts`: Phase 5 - Multi-source retrieval
- `nodes/execute-sub-queries.node.ts`: Phase 5B - **NEW** Parallel sub-query execution for complex queries
- `nodes/fusion.node.ts`: Phase 5 - RRF result fusion
- `nodes/rerank.node.ts`: Phase 6 - Cross-encoder reranking
- `nodes/enrich-small-to-big.node.ts`: Phase 6 - Parent chunk enrichment
- `nodes/check-sufficiency.node.ts`: Phase 6 - Quality assessment
- `nodes/select-mode.node.ts`: Phase 6 - Final output selection
- `nodes/update-cache.node.ts`: Phase 1.5 - Cache update

**Workflow Pattern**:
```typescript
// Factory functions for dependency injection
export function createNodeName(service: ServiceType) {
  return async (state: RetrievalStateType): Promise<Partial<RetrievalStateType>> => {
    // Node logic
    return { updatedFields };
  };
}

// Graph construction in workflow service
new StateGraph(RetrievalState)
  .addNode('nodeName', createNodeFunction(dependencies))
  .addEdge(START, 'firstNode')
  .addConditionalEdges('conditionalNode', routingFunction, edgeMap)
  .addEdge('lastNode', END)
  .compile();
```

#### /src/retrieval/services - Business Logic Services

**Purpose**: Implements core retrieval operations and integrations.

**Key Services**:

1. **query-transformation.service.ts** (390 lines) **[UPDATED Nov 2025]**
   - Implements 4 query transformation techniques with full .env configuration
   - **Query Reformulation**: 3-5 variations (configurable provider, temp, retry, timeout, fallback)
   - **Query Rewrite**: Clarify intent (configurable provider, temp, retry, timeout, fallback)
   - **HyDE**: Hypothetical docs (configurable provider, temp, retry, timeout, fallback)
   - **Query Decomposition**: 2-4 sub-queries (configurable provider, temp, retry, timeout, fallback)
   - Type-safe LLM provider validation (no `any`, no `as` casting)
   - Retry logic with exponential backoff (default: 2 retries)
   - Timeout protection using Promise.race (default: 10s)
   - Automatic fallback to secondary provider on failure
   - Pattern: `getTransformationConfig()` + `executeWithRetryAndFallback()`

2. **qdrant.service.ts** (350 lines)
   - Vector search operations
   - Collection management
   - Filter construction for RBAC
   - Batch embedding search
   - Health checks

3. **qdrant-cache.service.ts** (400 lines)
   - Semantic cache implementation
   - Similarity-based cache lookup (threshold: 0.95)
   - Cache storage and retrieval
   - TTL management (default: 1 hour)
   - Per-user cache collections

4. **mysql.service.ts** (180 lines)
   - Parent/child chunk queries
   - Metadata hydration for enrichment
   - Health checks

5. **reranker.service.ts** (210 lines)
   - TEI client for BGE-Reranker
   - Batch reranking
   - Score normalization
   - Timeout handling
   - Health checks

6. **entity-extraction.service.ts** (180 lines)
   - Extract entities from queries
   - NER (Named Entity Recognition)
   - Entity type classification
   - Graph query preparation

7. **sparse-embedding.service.ts** (100 lines)
   - BM25-style sparse vectors
   - Keyword extraction
   - TF-IDF calculation

8. **cache-invalidation.service.ts** (130 lines)
   - Scheduled cache cleanup
   - Document update invalidation
   - Cron job management
   - Cache metrics tracking

#### /src/retrieval/providers - LLM Provider Abstraction

**Purpose**: Factory pattern for multi-provider LLM and embedding support.

**Key Files**:

1. **llm-provider.factory.ts**
   - Creates chat models for query transformations
   - Supports OpenAI, Google, Anthropic, Ollama
   - Provider-specific configuration
   - Fallback logic

2. **embedding-provider.factory.ts**
   - Creates embedding models
   - Supports OpenAI, Google, Ollama
   - Batch embedding support
   - Retry logic with exponential backoff

3. **types.ts**
   - Provider configuration interfaces
   - Model parameter types
   - Factory method signatures

**Pattern**:
```typescript
// Factory with provider selection
createChatModel(provider: string, options?: ChatModelOptions): ChatModel {
  switch(provider) {
    case 'openai': return new ChatOpenAI(config);
    case 'google': return new ChatGoogleGenerativeAI(config);
    case 'anthropic': return new ChatAnthropic(config);
    case 'ollama': return new ChatOllama(config);
    default: throw new Error('Unknown provider');
  }
}
```

#### /src/retrieval/clients - External Service Clients

**Purpose**: Communication with other LTV Assistant services.

**Key Files**:

1. **datasource.client.ts**
   - TCP client for datasource service
   - Document metadata queries
   - Access permission checks
   - User document whitelist retrieval

2. **datasource-tcp-client.module.ts**
   - NestJS module for TCP client configuration
   - Connection pooling
   - Timeout management

**Communication Pattern**:
```typescript
// TCP message pattern
@Client({ transport: Transport.TCP, options: { host, port } })
private client: ClientProxy;

send(pattern: { cmd: string }, payload: object): Observable<Response>
```

#### /src/retrieval/dto - Data Transfer Objects

**Purpose**: Request/response validation and transformation.

**Key Files**:

1. **query-request.dto.ts**
   - Query input validation
   - Default value assignment
   - Type transformation

2. **retrieval-result.dto.ts**
   - Response formatting
   - Metrics structure
   - Context output shape

**Validation**: Uses class-validator decorators
```typescript
class QueryRequestDto {
  @IsString() @IsNotEmpty() query: string;
  @IsEnum(['retrieval_only', 'generation']) @IsOptional() mode?: string;
  @IsInt() @Min(1) @Max(50) @IsOptional() topK?: number;
}
```

#### /src/retrieval/types - Type Definitions

**Purpose**: Strong TypeScript typing for all retrieval operations.

**Key Types** (174 lines):
- `QdrantResult`: Vector search result
- `DocumentMetadata`: Document info from datasource
- `FusedResult`: Post-RRF fusion result
- `RerankedResult`: Post-reranking result
- `EnrichedContext`: Parent chunk with child chunks
- `Context`: Final output context
- `AccessFilter`: RBAC filter structure
- `QdrantFilter`: Qdrant query filter

### /src/shared - Cross-Cutting Concerns

**Purpose**: Application-wide utilities for logging, tracing, and middleware.

#### /src/shared/logging

**Key Files**:
- `pino.config.ts`: Structured JSON logging configuration
  - Request ID correlation
  - Timestamp formatting
  - Log level filtering
  - Pretty printing in development

#### /src/shared/middleware

**Key Files**:
- `request-id.middleware.ts`: Generate unique request IDs
  - UUID v4 generation
  - Header extraction (x-request-id)
  - Request context binding

#### /src/shared/tracing

**Key Files**:
- `tracer.ts`: OpenTelemetry initialization
  - OTLP HTTP exporter
  - Auto-instrumentation
  - Service name configuration
  - Graceful shutdown

#### /src/shared/reranker

**Key Files**:
- Reranker client utilities (if separate from service)

## Main Modules and Services

### Application Modules Hierarchy

```
AppModule (root)
├── ConfigModule (global)
├── LoggerModule (Pino)
├── CacheConfigModule (Redis)
├── DatabaseModule (MySQL/Drizzle)
├── CommonModule
│   ├── GatewayAuthGuard
│   └── RolesGuard
└── RetrievalModule
    ├── WorkflowModule
    │   ├── RetrievalWorkflowService
    │   ├── EmbeddingProviderFactory
    │   ├── LLMProviderFactory
    │   ├── QueryTransformationService
    │   ├── QdrantService
    │   ├── QdrantCacheService
    │   ├── MySQLService
    │   ├── RerankerService
    │   ├── SparseEmbeddingService
    │   ├── EntityExtractionService
    │   └── DatasourceClient
    ├── DatasourceTcpClientModule
    │   └── DatasourceClient
    ├── ScheduleModule (cron jobs)
    │   └── CacheInvalidationService
    └── Controllers
        ├── RetrievalController (HTTP)
        └── RetrievalTcpController (TCP)
```

### Service Responsibilities

| Service | Responsibility | Notes |
| --- | --- | --- |
| RetrievalWorkflowService | LangGraph orchestration | All retrieval services |
| QueryTransformationService | Query transformations | LLM providers |
| QdrantService | Vector retrieval | Hybrid dense+sparse search |
| MySQLService | Metadata retrieval | Parent chunk hydration |
| RerankerService | Cross-encoder reranking | TEI hosted model |
| EntityExtractionService | Query enrichment | Used to improve Qdrant + metadata matching |
| SparseEmbeddingService | BM25 sparse vectors | None (local) |
| CacheInvalidationService | Scheduled cleanup | Redis, Qdrant |
| DatasourceClient | Document metadata | Datasource TCP service |

## Important Files and Their Roles

### Core Application Files

1. **src/main.ts** (65 lines)
   - Application bootstrap
   - HTTP server setup (port 50053)
   - TCP microservice setup (port 4005)
   - CORS configuration
   - Global validation pipe
   - Pino logger initialization
   - OpenTelemetry tracer initialization
   - Graceful shutdown handlers (SIGTERM, SIGINT)

2. **src/app.module.ts** (31 lines)
   - Root module imports
   - Global configuration
   - Middleware registration (RequestIdMiddleware)
   - Module composition

### Configuration Files

1. **package.json**
   - Dependencies: 33 production, 14 dev
   - Scripts: build, start, test, lint
   - Jest configuration

2. **tsconfig.json**
   - Compiler: ES2023 target, NodeNext modules
   - Strict: nullChecks, forceConsistentCasing
   - Decorators: emitDecoratorMetadata, experimentalDecorators
   - Output: dist/ directory

3. **.env.example** (293 lines)
   - 80+ environment variables
   - Organized by feature:
     - Server config (ports, environment)
     - Database config (MySQL, Redis, Qdrant)
     - LLM providers (OpenAI, Google, Anthropic, Ollama)
     - Query transformations (4 techniques × 10 params each)
     - Retrieval config (top-K, thresholds)
     - Cache config (TTL, similarity, cleanup)
     - Performance tuning (timeouts, batches, retries)
     - Observability (logging, tracing)

4. **Dockerfile** (58 lines)
   - Multi-stage build (builder + production)
   - Node 22 Alpine base
   - Non-root user (nestjs:nodejs)
   - Health check endpoint
   - dumb-init for signal handling
   - Ports: 50053 (HTTP), 4005 (TCP)

### Controller Files

1. **src/retrieval/retrieval.controller.ts** (HTTP)
   - REST API endpoints
   - Request validation
   - Authentication guards
   - Response formatting

2. **src/retrieval/retrieval-tcp.controller.ts** (199 lines)
   - TCP microservice endpoints
   - `query_contexts`: Main retrieval endpoint
   - `get_retrieval_health`: Health check
   - User context handling
   - Error serialization

## Dependencies and Integrations

### External Service Integrations

1. **Qdrant Vector Database**
   - Client: @qdrant/js-client-rest ^1.15.1
   - Purpose: Vector search, semantic cache
   - Collections: chunks, query_cache_public, query_cache_private
   - API: REST HTTP

2. **MySQL Database**
   - Client: mysql2 ^3.15.3
   - ORM: drizzle-orm ^0.44.7
   - Purpose: Chunk storage and lineage
   - Database: ltv_assistant_indexing_db

3. **Redis Cache**
   - Client: ioredis ^5.8.2
   - Purpose: Workflow checkpointer, cache manager
   - Features: TTL, pub/sub (future)

4. **BGE-Reranker (TEI)**
   - Client: axios ^1.13.2
   - Model: BAAI/bge-reranker-v2-m3
   - Endpoint: http://localhost:6201
   - Purpose: Cross-encoder reranking

5. **Datasource Service (TCP)**
   - Client: @nestjs/microservices ^11.1.8
   - Purpose: Document metadata, access control
   - Protocol: TCP (port 4004)

### LLM Provider Dependencies

| Provider | Package | Version | Models |
|----------|---------|---------|--------|
| OpenAI | @langchain/openai | ^0.3.17 | GPT-4o, text-embedding-3-small |
| Google | @langchain/google-genai | ^0.1.12 | Gemini-2.5-flash-lite, text-embedding-004 |
| Anthropic | @langchain/anthropic | ^0.3.33 | Claude Sonnet 4.5 |
| Ollama | @langchain/ollama | ^0.1.6 | gemma3:1b, bge-m3:567m |

### Observability Dependencies

| Purpose | Package | Version | Integration |
|---------|---------|---------|-------------|
| Logging | nestjs-pino | ^4.4.1 | Pino JSON logs |
| Tracing | @opentelemetry/sdk-node | ^0.207.0 | OTLP exporter |
| Metrics | (future) | - | Prometheus |

### Key Development Dependencies

- **Testing**: jest ^30.0.0, @nestjs/testing ^11.0.1
- **Linting**: eslint ^9.18.0, typescript-eslint ^8.20.0
- **Formatting**: prettier ^3.4.2
- **TypeScript**: typescript ^5.7.3
- **Build**: @nestjs/cli ^11.0.0, ts-node ^10.9.2

## Code Organization Patterns

### Module Pattern
- Feature-based modules (RetrievalModule, WorkflowModule)
- Singleton services via dependency injection
- Lazy loading for performance

### Factory Pattern
- LLM providers (strategy pattern)
- Embedding providers
- Workflow nodes (factory functions)

### Repository Pattern
- Service layer abstracts data access
- Drizzle ORM for type-safe queries
- Separation of read/write concerns

### Guard Pattern
- Authentication guards (GatewayAuthGuard)
- Authorization guards (RolesGuard)
- Decorator-based access control

### Middleware Pattern
- Request ID generation
- User context extraction
- Logging and tracing

### State Machine Pattern
- LangGraph for workflow orchestration
- Immutable state updates
- Conditional routing

## File Count Statistics

- Total TypeScript files: 49
- Workflow nodes: 10
- Services: 9
- Providers: 2 factories
- Controllers: 2
- Guards: 2
- Decorators: 2
- DTOs: 2

## Naming Conventions

- Modules: `*.module.ts` (PascalCase class)
- Services: `*.service.ts` (PascalCase class)
- Controllers: `*.controller.ts` (PascalCase class)
- Nodes: `*.node.ts` (camelCase function)
- Types: `*.types.ts` or `types/index.ts`
- DTOs: `*.dto.ts` (PascalCase class)
- Interfaces: PascalCase with descriptive names
- Constants: UPPER_SNAKE_CASE

## Build and Deployment

### Build Process
```bash
npm ci                  # Install dependencies
npm run build          # Compile TypeScript to dist/
```

### Development
```bash
npm run start:dev      # Watch mode with hot reload
```

### Production
```bash
npm run start:prod     # Run compiled dist/main.js
```

### Docker
```bash
docker build -t ltv-assistant-retrieval .
docker run -p 50053:50053 -p 4005:4005 ltv-assistant-retrieval
```

## Testing Structure

### Unit Tests
- Located alongside source files (*.spec.ts)
- Coverage target: 80%+
- Framework: Jest

### E2E Tests
- Located in test/ directory
- Pattern: test/*.e2e-spec.ts

### Test Commands
```bash
npm run test           # Run unit tests
npm run test:watch     # Watch mode
npm run test:cov       # Coverage report
npm run test:e2e       # E2E tests
```
