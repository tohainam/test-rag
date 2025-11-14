# LTV Assistant Retrieval Service

Advanced semantic retrieval system powering context-aware document search and RAG (Retrieval-Augmented Generation) workflows for the LTV Assistant platform.

## Overview

The LTV Assistant Retrieval Service is a production-ready NestJS microservice that orchestrates sophisticated retrieval pipelines using LangGraph.js state machines. It combines multi-source retrieval (vector search, knowledge graphs, metadata), query transformations, cross-encoder reranking, and semantic caching to deliver high-quality contexts for question answering and document discovery.

### Key Features

- **LangGraph Workflow Engine**: State-based orchestration with 10 specialized nodes
- **Multi-Source Retrieval**: Qdrant (vectors) and MySQL (metadata)
- **Query Transformations**: Reformulation, rewriting, HyDE, decomposition
- **Cross-Encoder Reranking**: BGE-Reranker-v2-m3 via Hugging Face TEI
- **Semantic Caching**: Vector-based cache with 95% similarity threshold
- **Small-to-Big Enrichment**: Retrieve child chunks (~512 tokens), enrich with parents (~1800 tokens)
- **Adaptive Quality Loop**: Automatic retry with parameter adjustment
- **Multi-Provider LLM Support**: OpenAI, Google, Anthropic, Ollama
- **Role-Based Access Control**: Document-level permissions at retrieval
- **Dual Transport**: HTTP REST + TCP microservice protocols

## Quick Start

### Prerequisites

- Node.js 22 or later
- Docker and Docker Compose (for dependencies)
- MySQL 8.0+
- Qdrant 1.7+
- Redis 7.0+
- (Optional) BGE-Reranker TEI, Ollama

### Installation

```bash
# Clone repository (or navigate to service directory)
cd ltv-assistant-retrieval

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure environment variables (see Configuration section)
nano .env
```

### Running the Service

#### Development Mode

```bash
# Start with hot reload
npm run start:dev

# The service will be available at:
# - HTTP: http://localhost:50053
# - TCP: tcp://localhost:4005
```

#### Production Mode

```bash
# Build the service
npm run build

# Start production server
npm run start:prod
```

#### Docker Mode

```bash
# Build Docker image
docker build -t ltv-assistant-retrieval:latest .

# Run container
docker run -p 50053:50053 -p 4005:4005 \
  --env-file .env \
  ltv-assistant-retrieval:latest
```

## Environment Setup

### Required Configuration

Create a `.env` file with at minimum these required variables:

```bash
# Server
PORT=50053
TCP_PORT=4005
NODE_ENV=development

# MySQL (Chunk Storage)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=ltv_assistant_indexing_db

# Qdrant (Vector Database)
QDRANT_URL=http://localhost:6333

# Redis (Cache)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379

# LLM Provider (default: ollama for local development)
LLM_PROVIDER=ollama
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=gemma3:1b
OLLAMA_EMBEDDING_MODEL=bge-m3:567m
```

### Optional Configuration

```bash
# BGE-Reranker (TEI)
TEI_RERANKER_URL=http://localhost:6201
RERANK_SCORE_THRESHOLD=0.3
RERANK_FALLBACK_COUNT=3

# Semantic Cache
CACHE_ENABLED=true
CACHE_TTL=3600
CACHE_SIMILARITY_THRESHOLD=0.95

# Performance Tuning
TOP_K_DEFAULT=10
MAX_RETRY_ITERATIONS=3
EMBEDDING_BATCH_SIZE=24
```

See [.env.example](/.env.example) for complete configuration options (80+ variables).

## Configuration Guide

### LLM Provider Setup

The service supports multiple LLM providers via factory pattern:

#### OpenAI

```bash
LLM_PROVIDER=openai
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

#### Google Gemini

```bash
LLM_PROVIDER=google
EMBEDDING_PROVIDER=google
GOOGLE_API_KEY=AIza...
GOOGLE_CHAT_MODEL=gemini-2.5-flash-lite
GOOGLE_EMBEDDING_MODEL=text-embedding-004
```

#### Anthropic Claude

```bash
LLM_PROVIDER=anthropic
EMBEDDING_PROVIDER=ollama  # Anthropic doesn't provide embeddings
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_CHAT_MODEL=claude-sonnet-4-5-20250929
```

#### Ollama (Local, Free)

```bash
LLM_PROVIDER=ollama
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=gemma3:1b
OLLAMA_EMBEDDING_MODEL=bge-m3:567m
```

### Query Transformation Configuration

Each transformation technique can be individually configured:

```bash
# Query Reformulation (3-5 variations)
QUERY_REFORMULATION_PROVIDER=ollama
QUERY_REFORMULATION_MODEL=gemma3:1b
QUERY_REFORMULATION_TEMPERATURE=0.7
QUERY_REFORMULATION_MAX_TOKENS=200
QUERY_REFORMULATION_TIMEOUT=10000
QUERY_REFORMULATION_FALLBACK_ENABLED=true

# Query Rewrite (clarify intent)
QUERY_REWRITE_PROVIDER=ollama
QUERY_REWRITE_TEMPERATURE=0.3
QUERY_REWRITE_MAX_TOKENS=150

# HyDE (hypothetical documents)
HYDE_PROVIDER=ollama
HYDE_TEMPERATURE=0.5
HYDE_MAX_TOKENS=250

# Query Decomposition (2-4 sub-queries)
QUERY_DECOMPOSITION_PROVIDER=ollama
QUERY_DECOMPOSITION_TEMPERATURE=0.4
QUERY_DECOMPOSITION_MAX_TOKENS=200
```

### Database Setup

#### MySQL

```sql
-- Create database (handled by indexing service)
CREATE DATABASE ltv_assistant_indexing_db;

-- Tables are created by indexing service
-- Retrieval service has READ-ONLY access
```

#### Qdrant

```bash
# Pull and run Qdrant
docker run -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant:latest

# Collections are created by indexing service
# - chunks (main embeddings)
# - query_cache_public (semantic cache)
```

#### Redis

```bash
# Pull and run Redis
docker run -p 6379:6379 redis:alpine
```

### BGE-Reranker Setup (Optional)

```bash
# Pull and run Text Embeddings Inference (TEI) with BGE-Reranker
docker run -p 6201:80 \
  -v $PWD/data:/data \
  ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \
  --model-id BAAI/bge-reranker-v2-m3 \
  --revision refs/pr/4

# Configure retrieval service
TEI_RERANKER_URL=http://localhost:6201
RERANK_SCORE_THRESHOLD=0.3
RERANK_FALLBACK_COUNT=3
```

See [docs/bge-reranker-guide.md](/docs/bge-reranker-guide.md) for detailed setup.

## API Documentation

### HTTP Endpoints

#### POST /query

Execute retrieval workflow and return relevant contexts.

**Request:**
```json
{
  "query": "What is LangChain?",
  "mode": "retrieval_only",
  "topK": 10,
  "useCache": true
}
```

**Response:**
```json
{
  "contexts": [
    {
      "parentChunkId": "parent_123",
      "documentId": "doc_456",
      "content": "LangChain is a framework for developing applications powered by language models...",
      "tokens": 1800,
      "score": 0.85,
      "metadata": {
        "documentTitle": "LangChain Documentation",
        "sectionPath": ["Introduction", "Overview"]
      },
      "sources": {
        "childChunks": [
          {
            "chunkId": "child_789",
            "content": "LangChain is a framework...",
            "score": 0.85
          }
        ]
      }
    }
  ],
  "metrics": {
    "totalDuration": 1234,
    "cacheHit": false,
    "qdrantResultCount": 15,
    "rerankedResultCount": 10,
    "parentChunkCount": 5,
    "iterations": 1,
    "sufficiencyScore": 0.82
  },
  "cached": false
}
```

#### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "uptime": 12345,
  "timestamp": "2025-01-13T10:21:00.000Z"
}
```

### TCP Endpoints

#### query_contexts

Main retrieval endpoint for inter-service communication.

**Request:**
```typescript
{
  cmd: 'query_contexts',
  query: 'What is LangChain?',
  userId: 'user_123',
  userEmail: 'user@example.com',
  userRole: 'USER',
  topK: 10,
  mode: 'retrieval_only'
}
```

**Response:**
```typescript
{
  success: true,
  contexts: Context[],
  metrics: { ... }
}
```

#### get_retrieval_health

Health check for service discovery.

**Request:**
```typescript
{
  cmd: 'get_retrieval_health'
}
```

**Response:**
```typescript
{
  success: true,
  status: 'healthy',
  services: {
    qdrant: true,
    mysql: true,
    redis: true
  }
}
```

## Workflow Architecture

The retrieval pipeline is orchestrated by LangGraph with 6 phases:

### Phase 1.5: Semantic Cache
- **checkCache**: Look up similar queries in cache (threshold: 0.95)
- **updateCache**: Store results after retrieval (TTL: 1 hour)

### Phase 4: Query Analysis & Transformation
- **analyzeQuery**: Parallel execution of:
  - Query embedding (BGE-M3)
  - Reformulation (3-5 variations)
  - Rewriting (clarify intent)
  - HyDE (hypothetical document)
  - Decomposition (2-4 sub-queries)

### Phase 5: Multi-Source Retrieval
- **buildAccessFilter**: RBAC filter based on user role
- **hybridRetrieval**: Parallel retrieval from:
  - Qdrant (dense vector search)
  - MySQL (metadata search, optional)
- **fusion**: Reciprocal Rank Fusion (RRF) algorithm

### Phase 6: Reranking & Enrichment
- **rerank**: Cross-encoder reranking (BGE-Reranker-v2-m3)
  - Filter by threshold (default: 0.3)
  - Fallback to top-N if all filtered (default: 3)
- **enrich**: Small-to-big enrichment (child → parent chunks)
- **checkSufficiency**: Quality assessment with retry loop
- **selectMode**: Format final output

See [docs/diagrams.md](/docs/diagrams.md) for visual workflow diagrams.

## Directory Structure

```
ltv-assistant-retrieval/
├── src/
│   ├── app.module.ts              # Root module
│   ├── main.ts                    # Application bootstrap
│   ├── common/                    # Shared utilities
│   │   ├── cache/                # Redis cache config
│   │   ├── decorators/           # Custom decorators
│   │   ├── guards/               # Auth & RBAC guards
│   │   └── interfaces/           # Type definitions
│   ├── database/                  # Database layer
│   │   ├── database.module.ts    # Drizzle ORM config
│   │   └── schema.ts             # Table schemas
│   ├── retrieval/                 # Core domain
│   │   ├── retrieval.module.ts   # Retrieval module
│   │   ├── retrieval.controller.ts        # HTTP controller
│   │   ├── retrieval-tcp.controller.ts    # TCP controller
│   │   ├── workflow/             # LangGraph workflow
│   │   │   ├── retrieval-workflow.service.ts   # Graph builder
│   │   │   ├── state/            # State definition
│   │   │   ├── nodes/            # Workflow nodes (cache, analyze, buildFilter, hybridRetrieval, fusion, rerank, enrich)
│   │   │   ├── providers/        # Node factories
│   │   │   └── services/         # Qdrant, MySQL, cache, reranker
│   │   ├── providers/            # LLM/Embedding factories
│   │   ├── clients/              # External service clients
│   │   ├── dto/                  # Data transfer objects
│   │   └── types/                # TypeScript types
│   └── shared/                    # Cross-cutting concerns
│       ├── logging/              # Pino logger config
│       ├── middleware/           # Request middleware
│       └── tracing/              # OpenTelemetry
├── docs/                          # Documentation
│   ├── project-overview-pdr.md   # Project overview & PDR
│   ├── codebase-summary.md       # Codebase structure
│   ├── code-standards.md         # Coding standards
│   ├── system-architecture.md    # Architecture details
│   ├── diagrams.md               # Mermaid diagrams
│   ├── bge-reranker-guide.md     # Reranker setup
│   ├── semantic-cache-design.md  # Cache design
│   └── deployment-guide.md       # Deployment guide
├── test/                          # E2E tests
├── .env.example                   # Environment template
├── Dockerfile                     # Production container
├── package.json                   # Dependencies
└── README.md                      # This file
```

## Development

### Code Standards

- **Strong Typing**: Never use `any` or `as` type assertions
- **Immutable State**: LangGraph enforces immutable state updates
- **Error Handling**: Graceful degradation with fallbacks
- **Logging**: Structured JSON logs via Pino
- **Testing**: Jest unit tests and E2E tests

See [docs/code-standards.md](/docs/code-standards.md) for detailed guidelines.

### Scripts

```bash
# Development
npm run start:dev          # Watch mode with hot reload
npm run start:debug        # Debug mode

# Build
npm run build              # Compile TypeScript to dist/

# Production
npm run start:prod         # Run compiled code

# Code Quality
npm run format             # Format with Prettier
npm run lint               # Lint with ESLint
npm run check              # Format + Lint + Build

# Testing
npm run test               # Run unit tests
npm run test:watch         # Watch mode
npm run test:cov           # Coverage report
npm run test:e2e           # E2E tests
```

### Adding a New Workflow Node

1. Create node file in `src/retrieval/workflow/nodes/`:
```typescript
export function createMyNode(service: MyService) {
  return async (state: RetrievalStateType): Promise<Partial<RetrievalStateType>> => {
    // Node implementation
    return {
      currentStage: 'myNode',
      // ... state updates
    };
  };
}
```

2. Update state definition in `state/retrieval-state.ts`:
```typescript
export const RetrievalState = Annotation.Root({
  // ... existing fields
  myNodeResult: Annotation<MyResult[]>,
});
```

3. Add node to graph in `retrieval-workflow.service.ts`:
```typescript
.addNode('myNode', createMyNode(this.myService))
.addEdge('previousNode', 'myNode')
.addEdge('myNode', 'nextNode')
```

## Testing

### Unit Tests

```bash
# Run all tests
npm run test

# Run specific test file
npm run test -- query-transformation.service.spec.ts

# Watch mode
npm run test:watch

# Coverage
npm run test:cov
```

### E2E Tests

```bash
# Run E2E tests (requires running services)
npm run test:e2e
```

### Manual Testing

```bash
# Test HTTP endpoint
curl -X POST http://localhost:50053/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is LangChain?",
    "topK": 5
  }'

# Test health endpoint
curl http://localhost:50053/health
```

## Deployment

### Docker Deployment

See [docs/deployment-guide.md](/docs/deployment-guide.md) for complete deployment instructions.

```bash
# Build production image
docker build -t ltv-assistant-retrieval:latest .

# Run with docker-compose
docker-compose up -d retrieval

# View logs
docker-compose logs -f retrieval
```

### Environment Variables in Production

**Security**:
- Never commit `.env` to version control
- Use secrets management (Kubernetes Secrets, AWS Secrets Manager, etc.)
- Rotate API keys regularly

**Performance**:
- Adjust `EMBEDDING_BATCH_SIZE` based on available memory
- Tune `CACHE_TTL` based on update frequency
- Configure `MAX_RETRY_ITERATIONS` for quality vs latency tradeoff

**Monitoring**:
- Enable OpenTelemetry tracing (`OTEL_EXPORTER_OTLP_ENDPOINT`)
- Set appropriate `LOG_LEVEL` (info in production, debug in development)
- Configure health check intervals

## Monitoring and Observability

### Logging

Structured JSON logs via Pino:

```json
{
  "level": "info",
  "time": "2025-01-13T10:21:00.000Z",
  "msg": "Retrieval workflow completed: 5 contexts, 1234ms",
  "requestId": "uuid",
  "userId": "user123",
  "query": "What is LangChain?",
  "contexts": 5,
  "duration": 1234,
  "cacheHit": false
}
```

### Tracing

OpenTelemetry distributed tracing:

```bash
# Configure OTLP endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces

# Traces include:
# - Workflow execution span (parent)
# - Node execution spans (children)
# - External service calls (HTTP, TCP, DB)
```

### Metrics

Key metrics tracked:
- `totalDuration`: End-to-end latency
- `cacheHit`: Cache hit rate
- `qdrantResultCount`: Vector search results
- `rerankedResultCount`: Post-reranking results
- `rerankFallbackTriggered`: Fallback activation count
- `iterations`: Retry loop iterations
- `sufficiencyScore`: Context quality score

## Troubleshooting

### Common Issues

#### 1. Qdrant Connection Failed

```bash
# Check Qdrant is running
curl http://localhost:6333/collections

# Verify QDRANT_URL in .env
QDRANT_URL=http://localhost:6333
```

#### 2. MySQL Connection Error

```bash
# Check MySQL is running
mysql -h localhost -u root -p

# Verify database exists
SHOW DATABASES LIKE 'ltv_assistant_indexing_db';

# Check credentials in .env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
```

#### 3. LLM Provider Timeout

```bash
# Increase timeout
QUERY_REFORMULATION_TIMEOUT=30000

# Switch to faster model
OLLAMA_CHAT_MODEL=gemma3:1b  # Faster than larger models

# Disable specific transformations
QUERY_REFORMULATION_FALLBACK_ENABLED=false
```

#### 4. Reranker Service Unavailable

```bash
# Check TEI is running
curl http://localhost:6201/health

# Service gracefully degrades to RRF scores
# Check logs for:
# "Reranking failed: ... (using RRF fallback)"
```

#### 5. Cache Not Working

```bash
# Check Redis is running
redis-cli ping

# Verify cache is enabled
CACHE_ENABLED=true

# Check cache collection exists in Qdrant
curl http://localhost:6333/collections/query_cache_public
```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug

# Start in debug mode
npm run start:debug

# Attach debugger to port 9229
```

## Performance Tuning

### Latency Optimization

```bash
# Enable cache
CACHE_ENABLED=true
CACHE_TTL=3600

# Reduce transformations
QUERY_REFORMULATION_MAX_TOKENS=100
HYDE_ENABLED=false

# Lower top-K
TOP_K_DEFAULT=5
```

### Throughput Optimization

```bash
# Increase batch size
EMBEDDING_BATCH_SIZE=48

# Increase database pool
DB_POOL_MAX=20

# Disable retry loop
MAX_RETRY_ITERATIONS=1

# Use faster LLM
OLLAMA_CHAT_MODEL=gemma3:1b
```

### Quality Optimization

```bash
# More aggressive reranking
RERANK_SCORE_THRESHOLD=0.5
RERANK_FALLBACK_COUNT=5

# Enable all transformations
QUERY_REFORMULATION_ENABLED=true
HYDE_ENABLED=true
QUERY_DECOMPOSITION_ENABLED=true

# Increase retry iterations
MAX_RETRY_ITERATIONS=5
SUFFICIENCY_THRESHOLD=0.8
```

## Links to Detailed Documentation

- [Project Overview & PDR](/docs/project-overview-pdr.md)
- [Codebase Summary](/docs/codebase-summary.md)
- [Code Standards](/docs/code-standards.md)
- [System Architecture](/docs/system-architecture.md)
- [Architecture Diagrams](/docs/diagrams.md)
- [BGE-Reranker Setup Guide](/docs/bge-reranker-guide.md)
- [Semantic Cache Design](/docs/semantic-cache-design.md)
- [Deployment Guide](/docs/deployment-guide.md)

## Contributing

See [code-standards.md](/docs/code-standards.md) for:
- TypeScript guidelines (no `any`, no `as`)
- Code organization patterns
- Testing approaches
- Documentation standards
- Error handling patterns

## License

Proprietary - LTV Assistant Platform

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review [docs/](/docs/) for detailed documentation
3. Contact the development team

---

Built with [NestJS](https://nestjs.com/), [LangChain](https://js.langchain.com/), and [LangGraph](https://langchain-ai.github.io/langgraphjs/)
