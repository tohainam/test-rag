# LTV Assistant Retrieval Service - Project Overview & PDR

## Project Overview
- **Primary Goal**: Deliver fast, accurate retrieval for LTV content
- **Multi-Source Integration**: Combine vector search (Qdrant) with structured metadata (MySQL); legacy graph integrations have been retired
- **Caching Strategy**: Semantic cache + TTL-based invalidation
- **Security & RBAC**: Strict access filters with audit trails
- **Observability**: Distributed tracing + metrics dashboard

## Product Development Requirements

### Functional Requirements

#### FR-1: Semantic Search and Retrieval
- Accept natural language queries from users
- Retrieve relevant document chunks using dense vector embeddings (BGE-M3)
- Support hybrid search combining semantic and keyword-based retrieval
- Return top-K most relevant contexts with metadata

#### FR-2: Query Transformation Pipeline
- **Query Reformulation**: Generate 3-5 query variations for improved recall
- **Query Rewriting**: Clarify intent and expand abbreviations
- **HyDE (Hypothetical Document Embeddings)**: Generate hypothetical answers for embedding
- **Query Decomposition**: Break complex queries into simpler sub-queries
- Execute transformations in parallel with configurable timeouts and fallbacks

#### FR-3: Multi-Source Retrieval
- **Qdrant Vector Search**: Dense vector similarity search in embedding space
- **MySQL Metadata Search**: Structured query against document metadata
- Fusion of results using Reciprocal Rank Fusion (RRF) algorithm

#### FR-4: Cross-Encoder Reranking
- Rerank fused results using BGE-Reranker-v2-m3 (via TEI service)
- Filter results by configurable score threshold
- Fallback to top-N results when all filtered by threshold
- Graceful degradation to RRF scores on reranker failure

#### FR-5: Small-to-Big Context Enrichment
- Retrieve small child chunks (~512 tokens) for precision
- Enrich with parent chunks (~1800 tokens) for sufficient context
- Include section paths, page numbers, and document metadata
- Optimize token usage for LLM context windows

#### FR-6: Adaptive Quality Loop
- Assess context quality after retrieval (sufficiency score)
- Automatically retry with adjusted parameters if quality insufficient
- Maximum configurable retry iterations
- Track quality metrics across iterations

#### FR-7: Semantic Cache (Phase 1.5)
- Cache query embeddings and results in Qdrant
- Check semantic similarity for cache hits (configurable threshold)
- Return cached results instantly on cache hit
- Update cache after successful retrieval
- Scheduled cache cleanup and invalidation
- Per-user cache isolation (public vs private)

#### FR-8: Role-Based Access Control
- Build access filters based on user role (SUPER_ADMIN, ADMIN, USER)
- Filter documents by ownership and access permissions
- Support public documents and user-specific whitelists
- Integrate with datasource service for permission metadata

#### FR-9: TCP Microservice Interface
- Expose retrieval functionality via TCP protocol
- Support inter-service communication without HTTP overhead
- Pattern: `query_contexts` and `get_retrieval_health` endpoints
- Enable CMS and other services to query contexts directly

### Non-Functional Requirements

#### NFR-1: Performance
- **Latency**: Average query response time < 2 seconds (without cache)
- **Throughput**: Support 100+ concurrent queries
- **Cache Hit Rate**: Achieve 60%+ cache hit rate for repeated queries
- **Embedding Batch Processing**: Process up to 24 embeddings concurrently

#### NFR-2: Scalability
- Horizontal scaling via Docker containers
- Stateless workflow execution (no session state)
- Connection pooling for MySQL (max 10 connections)
- Configurable top-K and batch sizes

#### NFR-3: Reliability
- Graceful fallbacks for all external service failures
- Retry logic with exponential backoff for transient failures
- Health checks for all dependencies (Qdrant, MySQL, TEI)
- Comprehensive error logging and metrics

#### NFR-4: Observability
- Structured JSON logging via Pino
- OpenTelemetry tracing integration (OTLP export)
- Detailed workflow metrics (duration, counts, cache hits)
- Stage-by-stage performance tracking

#### NFR-5: Maintainability
- Strong TypeScript typing (no `any`, no `as` assertions)
- Modular architecture with clear separation of concerns
- Comprehensive inline documentation
- Factory patterns for provider abstraction
- Configuration via environment variables

#### NFR-6: Security
- Request ID tracking for audit trails
- User context validation on all requests
- Secure inter-service communication via TCP
- Input validation and sanitization
- No secrets in logs or error messages

## Key Features and Capabilities

### 1. LangGraph Workflow Engine
- State-based workflow orchestration using LangGraph.js
- 10 specialized workflow nodes for different retrieval stages
- Conditional branching (cache hit/miss, retry logic)
- Comprehensive state management with 40+ state fields

### 2. Multi-Provider LLM Support
- **OpenAI**: GPT-4o for chat, text-embedding-3-small for embeddings
- **Google Gemini**: Gemini-2.5-flash-lite for chat, text-embedding-004
- **Anthropic Claude**: Claude Sonnet 4.5 for chat (no embeddings)
- **Ollama**: Local models (gemma3:1b for chat, bge-m3:567m for embeddings)
- Factory pattern with provider-specific fallbacks

### 3. Advanced Retrieval Techniques
- **Dense Vector Search**: BGE-M3 embeddings (1024 dimensions)
- **Sparse Vector Search**: BM25-style keyword matching
- **Hybrid Fusion**: RRF algorithm with configurable K=60
- **Graph Traversal**: _Removed_. Graph relationships are no longer part of the retrieval stack.
- **Metadata Filtering**: SQL-based document filtering

### 4. Intelligent Query Processing
- Parallel execution of 4 transformation techniques
- Configurable timeouts (default: 10s per technique)
- Fallback to original query on failures
- Temperature-tuned generation (0.3-0.7)

### 5. Cross-Encoder Reranking
- BGE-Reranker-v2-m3 via Hugging Face TEI
- Raw score output (can be negative for irrelevant results)
- Configurable threshold filtering (default: 0.3)
- Fallback count for aggressive filtering (default: 3)
- Metrics tracking for fallback triggers

### 6. Semantic Caching System
- Vector-based similarity search for cache lookups
- Configurable similarity threshold (default: 0.95)
- TTL-based expiration (default: 1 hour)
- Scheduled cleanup via cron (default: hourly)
- Per-user cache collections (public, private)
- Cache invalidation on document updates

## Target Users and Use Cases

### Target Users

1. **End Users**: Business professionals querying the LTV Assistant chatbot
2. **Administrators**: Managing document access and monitoring retrieval quality
3. **Developers**: Integrating retrieval into other LTV Assistant services
4. **Data Scientists**: Analyzing retrieval metrics and optimizing parameters

### Use Cases

#### UC-1: Knowledge Base Q&A
**Actor**: End User
**Flow**:
1. User asks question in natural language
2. System applies query transformations
3. System retrieves relevant contexts from knowledge base
4. System reranks and enriches contexts
5. User receives high-quality contexts for answer generation

#### UC-2: Document Discovery
**Actor**: End User
**Flow**:
1. User searches for specific documents or topics
2. System searches across vector DB, graph DB, and metadata
3. System fuses and ranks results
4. User receives ranked list of relevant documents

#### UC-3: Cached Query Performance
**Actor**: End User
**Flow**:
1. User submits query similar to recent query
2. System checks semantic cache
3. System returns cached results instantly (<100ms)
4. User receives immediate response

#### UC-4: Role-Based Document Access
**Actor**: End User (ADMIN role)
**Flow**:
1. User submits query
2. System builds access filter based on role
3. System retrieves only permitted documents
4. User sees only authorized content

#### UC-5: Inter-Service Retrieval
**Actor**: CMS Service (via TCP)
**Flow**:
1. CMS service sends TCP query_contexts request
2. Retrieval service executes workflow
3. Retrieval service returns contexts via TCP
4. CMS service uses contexts for content generation

## Technology Stack Overview

### Core Framework
- **NestJS 11**: Enterprise TypeScript framework
- **Node.js 22**: JavaScript runtime (Alpine Linux in production)
- **TypeScript 5.7**: Strict type checking with noImplicitAny

### AI/ML Stack
- **LangChain Core 0.3**: LLM abstraction and chaining
- **LangGraph 0.2**: State machine workflow orchestration
- **BGE-M3**: Multi-lingual embedding model (1024 dim)
- **BGE-Reranker-v2-m3**: Cross-encoder reranking model

### Databases
- **Qdrant 1.15**: Vector database for embeddings and cache
- **MySQL 3.15**: Relational database for chunk metadata
- **Redis 5.8**: In-memory cache and checkpointer
- **Drizzle ORM 0.44**: Type-safe SQL query builder

### External Services
- **Hugging Face TEI**: Text Embeddings Inference for reranking
- **OpenAI API**: GPT models and embeddings
- **Google Gemini API**: Gemini models and embeddings
- **Anthropic API**: Claude models
- **Ollama**: Local LLM inference

### Observability
- **Pino 4.4**: Structured JSON logging
- **OpenTelemetry 0.207**: Distributed tracing
- **OTLP HTTP Exporter**: Trace export to observability backends

### Development Tools
- **Jest 30**: Testing framework
- **ESLint 9**: TypeScript linting
- **Prettier 3**: Code formatting
- **Docker**: Containerization
- **npm**: Package management

### Communication Protocols
- **HTTP/Express**: REST API endpoints
- **TCP Microservices**: Inter-service communication
- **gRPC** (future): High-performance RPC

## System Context

The Retrieval Service sits at the core of the LTV Assistant platform, integrating with:

- **ltv-assistant-datasource**: Document metadata and access control
- **ltv-assistant-indexing**: Chunk storage and embedding indexing
- **ltv-assistant-cms**: Content management and query interface
- **ltv-assistant-auth**: User authentication and authorization
- **bge-reranker**: Cross-encoder reranking service (TEI)
- **api-gateway**: Request routing and authentication

## Success Metrics

### Quality Metrics
- **Relevance**: 80%+ of top-3 results rated relevant by users
- **Sufficiency Score**: Average sufficiency > 0.7
- **Cache Hit Rate**: 60%+ for repeated/similar queries

### Performance Metrics
- **P50 Latency**: < 1.5 seconds (without cache)
- **P95 Latency**: < 3.0 seconds (without cache)
- **Cache Latency**: < 100ms for cache hits
- **Throughput**: 100+ queries/second

### Reliability Metrics
- **Uptime**: 99.9% availability
- **Error Rate**: < 1% of requests fail
- **Fallback Rate**: < 5% of queries use fallback mechanisms

## Version History

- **v0.0.1** (Current): Initial implementation with Phase 1-6 complete
  - Core retrieval workflow
  - Query transformations
  - Multi-source retrieval
  - Reranking and enrichment
  - Semantic caching
  - Adaptive quality loop
  - Rerank fallback logic

## Future Roadmap

### Phase 2: Answer Generation
- Integrate LLM answer generation
- Streaming response support
- Hallucination detection
- Citation tracking

### Phase 3: Advanced Features
- Query intent classification
- Multi-modal retrieval (images, tables)
- Conversation context tracking
- Personalized ranking

### Phase 4: Optimization
- Embedding quantization
- Model distillation
- GPU acceleration
- Advanced caching strategies
