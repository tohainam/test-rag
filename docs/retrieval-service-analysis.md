# LTV Assistant - Retrieval Service (ltv-assistant-retrieval) - Comprehensive Analysis

**Analysis Date:** 2025-11-14  
**Service Priority:** HIGHEST  
**Status:** Production-Ready with Phase 1.5 Enhancements (Semantic Caching)

---

## Executive Summary

The **ltv-assistant-retrieval** service is the core RAG (Retrieval-Augmented Generation) engine of the LTV Assistant platform. It performs intelligent document retrieval through a sophisticated multi-stage LangGraph workflow that combines vector search, semantic caching, adaptive querying, and cross-encoder reranking. The service supports complex retrieval patterns with query transformation, access control, and enrichment strategies to maximize answer quality.

**Key Capabilities:**
- Hybrid Dense+Sparse vector search via Qdrant
- Semantic query caching with 0.95 similarity threshold
- Query transformation (reformulation, rewrite, HyDE, decomposition)
- Multi-source retrieval fusion with Reciprocal Rank Fusion (RRF)
- Cross-encoder reranking via BGE-Reranker-v2-m3
- Small-to-Big enrichment with parent chunk assembly
- Adaptive sufficiency checking with retry loops
- Role-based access control (SUPER_ADMIN, ADMIN, USER)
- OpenTelemetry tracing + Pino structured logging
- TCP microservice endpoints for inter-service communication

---

## 1. RAG RETRIEVAL FLOW

### Workflow Architecture (LangGraph.js StateGraph)

The retrieval pipeline consists of **11 interconnected nodes** with conditional edges for adaptive behavior:

```
START
  ↓
[1] checkCache (Phase 1.5) ──→ Cache HIT → END (return cached contexts)
  │
  └→ Cache MISS ↓
  
[2] analyzeQuery (Phase 4)
  │ • Query Reformulation (3-5 variations)
  │ • Query Rewrite (clarification)
  │ • HyDE (Hypothetical Document)
  │ • Query Decomposition (2-4 sub-queries)
  │ • Embedding generation (1024D dense vectors)
  ↓
[3] buildAccessFilter (Phase 5)
  │ • RBAC filter construction
  │ • Document whitelist filtering
  ↓
[4] hybridRetrieval (Phase 5)
  │ • Qdrant dense vector search (query embedding)
  │ • Qdrant HyDE search (if available)
  │ • Reformulated queries search (parallel)
  │ • Rewritten query search
  │ • MySQL metadata document search
  │ • Multi-vector merge (children, summaries, questions)
  ↓
[5] executeSubQueries (Phase 5B, conditional)
  │ • Parallel sub-query execution (if decomposition triggered)
  │ • Merges results back to main flow
  ↓
[6] fusion (Phase 5)
  │ • Reciprocal Rank Fusion (RRF) algorithm (k=60)
  │ • Deduplication and score aggregation
  │ • Result buffering (1.5 × topK)
  ↓
[7] rerank (Phase 6)
  │ • Cross-encoder reranking (BGE-Reranker-v2-m3 via TEI)
  │ • Score threshold filtering (RERANK_SCORE_THRESHOLD)
  │ • Graceful fallback to RRF on failure
  ↓
[8] enrich (Phase 6)
  │ • Small-to-Big assembly: child chunks → parent chunks
  │ • MySQL parent chunk hydration
  │ • Metadata enrichment
  ↓
[9] checkSufficiency (Phase 6)
  │ • Composite score: highQualityRatio*0.5 + avgScore*0.3 + coverage*0.2
  │ • Adaptive retry decision (max 3 iterations)
  │ • Query decomposition trigger (if insufficient + no retries)
  │
  └→ shouldRetry=true → [2] analyzeQuery (loop)
  └→ decomposition=true → [5] executeSubQueries
  └→ continue → [10]
  
[10] selectMode (Phase 6)
  │ • Mode selection (retrieval_only vs generation)
  │ • Final context formatting
  ↓
[11] updateCache (Phase 1.5)
  │ • Semantic cache storage (public documents only)
  │ • TTL assignment (default 3600s)
  │ • Invalidation tracking
  ↓
END (return final contexts + metrics)
```

### Key Design Decisions

1. **Stateless Architecture:** No checkpoint persistence - each workflow execution is isolated
2. **Non-Critical Cache Failures:** Cache errors don't fail retrieval - workflow continues gracefully
3. **Public-Only Caching:** Cache only when ALL contexts are public documents (zero permission leaks)
4. **Adaptive Retries:** Up to 3 iterations with query transformations if results insufficient
5. **Query Decomposition Fallback:** Complex queries split into sub-queries when adaptive retries exhausted
6. **Multi-Vector Search:** Query results fused from 3 Qdrant collections (children, summaries, questions)

---

## 2. API ENDPOINTS

### HTTP Endpoints (Port: 50053)

#### POST /query
**Main retrieval endpoint** - Accessed via API Gateway proxy

**Request:**
```typescript
{
  query: string;                    // User query (required)
  mode?: "retrieval_only" | "generation";  // Output mode (default: retrieval_only)
  topK?: number;                    // Number of contexts (1-50, default: 10)
  useCache?: boolean;               // Enable semantic cache (default: true, Phase 1.5)
}
```

**Response:**
```typescript
{
  contexts: Array<{
    parentChunkId: string;
    documentId: string;
    content: string;              // Parent chunk content (~1800 tokens)
    tokens: number;               // Token count
    score: number;                // Reranked score
    metadata: Record<string, unknown>;
    sources: {
      childChunks: Array<{
        chunkId: string;
        content: string;          // Child chunk content (~512 tokens)
        score: number;            // Rerank score
      }>;
    };
  }>;
  
  metrics: {
    totalDuration: number;        // End-to-end latency (ms)
    cacheHit: boolean;            // Was result from cache?
    qdrantResultCount: number;    // Results from vector search
    rerankedResultCount: number;  // After cross-encoder reranking
    parentChunkCount: number;     // Final enriched contexts
    iterations: number;           // Adaptive loop iterations
    sufficiencyScore: number;     // Composite sufficiency (0-1)
  };
  
  cached: boolean;                // True if from semantic cache
}
```

**Authentication:** Requires API Gateway auth guard (JWT validation via Auth service TCP)

**Error Handling:**
- 400: Invalid input (validation error)
- 401: Unauthorized (invalid JWT or missing auth headers)
- 500: Internal server error (workflow failure)

---

### TCP Microservice Endpoints (Port: 4005)

#### query_contexts (MessagePattern: { cmd: 'query_contexts' })
**Internal endpoint** - For inter-service retrieval (CMS, other services)

**Request:**
```typescript
{
  query: string;
  userId: string;
  userEmail: string;
  userRole: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  topK?: number;
  mode?: 'retrieval_only' | 'generation';
}
```

**Response:**
```typescript
{
  success: boolean;
  contexts?: Context[];
  metrics?: Record<string, unknown>;
  error?: string;
}
```

#### get_retrieval_health (MessagePattern: { cmd: 'get_retrieval_health' })
**Health check endpoint** - For service discovery

**Response:**
```typescript
{
  success: boolean;
  status: 'healthy' | 'degraded';
  message?: string;
  services?: {
    qdrant: boolean;
  };
}
```

---

## 3. CACHING LAYERS

### Semantic Cache (Phase 1.5 - Primary)

**Type:** Vector-based semantic similarity caching  
**Storage:** Qdrant collection `query_cache_public`  
**Strategy:** Public documents only (zero permission leaks)

**Key Metrics:**
- **Similarity Threshold:** 0.95 (very conservative for accuracy)
- **Vector Dimension:** 1024D (bge-m3:567m)
- **Default TTL:** 3600 seconds (1 hour)
- **Distance Metric:** Cosine similarity

**Payload Structure:**
```typescript
interface PublicCacheEntry {
  cacheId: string;           // UUID
  queryText: string;         // Original query
  contexts: Context[];       // Full retrieval result
  documentIds: string[];     // For invalidation tracking
  timestamp: number;         // Creation time (ms)
  ttl: number;              // Time-to-live (seconds)
  hits: number;             // Cache hit counter
  lastAccess: number;       // Last access time
}
```

**Workflow Integration:**
1. **checkCache node:** Semantic search with embeddings
   - Cache HIT (similarity ≥ 0.95): Return immediately, skip entire pipeline
   - Cache MISS: Continue to full retrieval
2. **updateCache node:** Store result (only if all contexts public)
   - Verify all document_access_type = "public"
   - Calculate document ID set for invalidation
   - Store with TTL

**Cache Control:**
- **Per-Request:** `useCache: false` flag disables lookup/storage
- **Environment:** `CACHE_ENABLED=true|false` (default: true)
- **Configuration:**
  - `CACHE_COLLECTION_NAME` (default: query_cache_public)
  - `CACHE_SIMILARITY_THRESHOLD` (default: 0.95)
  - `CACHE_TTL` (default: 3600)

**Invalidation:**
- Document updates trigger cache purge by document ID
- TTL-based auto-expiry via scheduled cleanup
- Admin endpoint for manual purge

**Performance Impact:**
- Cache hits: 20-50ms (semantic search latency)
- Full retrieval: 300-1500ms (target P95)
- Expected hit rate: 15-30% based on query distribution
- Load reduction: Significant for repeated queries

---

### Query-Level Caching (Future - Phase 2)

**Planned:** Per-query result caching in Redis  
**Purpose:** Exact match caching for identical queries  
**Status:** Not yet implemented

---

## 4. VECTOR SEARCH

### Qdrant Integration

**Service Class:** `QdrantService`  
**Client:** QdrantClient REST API (`@qdrant/js-client-rest`)  
**Collections:** 3 multi-vector collections

#### Multi-Vector Search Strategy

| Collection | Purpose | Indexed Content | Search Limit |
|---|---|---|---|
| documents_children | Primary search | Child chunks (~512 tokens) | topK full |
| documents_summaries | Contextual match | Document summaries | topK/2 |
| documents_questions | FAQ-style match | Generated Q&A | topK/2 |

**Search Method:**
```typescript
async search(
  embedding: number[],           // Query embedding (1024D)
  filter?: QdrantFilter,         // Access control filter
  limit: number = 20,            // Results per collection
  queryText?: string             // For sparse vector generation
): Promise<QdrantResult[]>
```

**Merging Strategy:**
1. Search all 3 collections in parallel
2. Deduplicate by parentChunkId (keep highest score)
3. Score boosting for summaries (×1.05) and questions (×1.1)
4. Sort by combined score
5. Return top K merged results

**Hybrid Dense + Sparse Search:**

**Dense Vector (always used):**
- Query embedding from embedding model (bge-m3:567m)
- Cosine similarity matching
- 1024D vector space

**Sparse Vector (if queryText provided):**
- BM25-style sparse vectors from query text
- Combined with dense for hybrid search
- Useful for keyword-heavy queries

---

### Qdrant Filter (RBAC)

**Filter Types:**
```typescript
interface QdrantFilter {
  should?: Array<{           // OR logic
    key: string;
    match: { value: string | string[] };
  }>;
  must?: Array<{             // AND logic
    key: string;
    match: { value: string | string[] };
  }>;
}
```

**Access Control:**
- `access_type: "public"` - Always searchable
- `access_type: "private"` - Only for document owner
- `access_type: "shared"` - Only for whitelisted users
- `document_id` whitelist from datasource service

---

### Query Transformations

**Service:** `QueryTransformationService`  
**LLM Providers:** OpenAI, Google, Anthropic, Ollama  
**Execution:** Parallel with retry + fallback logic

#### 1. Query Reformulation
- **Purpose:** Generate 3-5 query variations
- **Temperature:** 0.7 (creative)
- **Max Tokens:** 200
- **Prompt:** Rephrase query while preserving intent
- **Use Case:** Capture different phrasings for same intent

#### 2. Query Rewrite
- **Purpose:** Clarify and disambiguate
- **Temperature:** 0.3 (deterministic)
- **Max Tokens:** 200
- **Prompt:** Rewrite for clarity without changing meaning
- **Use Case:** Expand implicit context

#### 3. HyDE (Hypothetical Document Expansion)
- **Purpose:** Generate hypothetical answer document
- **Temperature:** 0.5 (balanced)
- **Max Tokens:** 300
- **Prompt:** "Write a document that would answer this query"
- **Use Case:** Direct embedding of expected answer format

#### 4. Query Decomposition
- **Purpose:** Break complex queries into sub-queries
- **Temperature:** 0.4 (focused)
- **Max Tokens:** 300
- **Prompt:** "Break query into independent sub-queries"
- **Use Case:** Complex multi-aspect questions
- **Execution:** Sub-queries executed in parallel via `executeSubQueries` node

**Retry & Fallback:**
- Primary provider with max 2 retries
- Timeout: 10 seconds per request
- Fallback provider if primary fails
- Continue on error (non-critical)

---

## 5. RERANKING LOGIC

### BGE-Reranker Integration

**Service Class:** `RerankerService`  
**Model:** BGE-Reranker-v2-m3 via TEI (Text Embedding Inference)  
**Endpoint:** `POST /rerank` (configurable URL)

**Reranking Pipeline:**
```
Fused Results (fusion node)
    ↓
Input Validation
  • Filter null/empty content
  • Skip results with zero-length content
    ↓
Reranker Call (TEI API)
  • Request: { query, texts: [content1, content2, ...] }
  • Response: [{ index, score }]
  • Score Range: -1.0 to 1.0 (not 0-1)
    ↓
Score Filtering
  • Threshold: RERANK_SCORE_THRESHOLD (default: 0.0)
  • Keep only: rerankScore > threshold
    ↓
Threshold Fallback
  • If all results filtered: Take top N from reranked (ignore threshold)
  • Fallback count: RERANK_FALLBACK_COUNT (default: 3)
    ↓
Result Sorting
  • Sort by rerankScore (descending)
  • Take top topK
    ↓
Final Output (rerank node)
```

**Error Handling:**
- **TEI Timeout (30s default):** Fallback to RRF scores
- **TEI Unavailable:** Use fused RRF scores as rerank scores
- **Empty Input:** Return empty array, continue workflow
- **Reranker Failure:** Non-critical, doesn't fail retrieval

**Score Interpretation:**
- Positive scores: Relevant (higher = more relevant)
- Negative scores: Irrelevant/contradictory
- Default threshold (0.0): Filters clearly irrelevant results
- Conservative approach for safety

---

## 6. PERFORMANCE METRICS

### Tracked Metrics

**Workflow-Level Metrics (WorkflowMetrics interface):**

```typescript
interface WorkflowMetrics {
  // Timings
  startTime: number;                    // Unix timestamp
  totalDuration?: number;               // End-to-end (ms)
  analysisDuration?: number;            // Query analysis phase
  accessFilterDuration?: number;        // RBAC filter building
  retrievalDuration?: number;           // Retrieval phase
  fusionDuration?: number;              // RRF fusion
  rerankingDuration?: number;           // Cross-encoder reranking
  enrichmentDuration?: number;          // Small-to-Big assembly
  cacheHitLatency?: number;             // Cache lookup time (ms)
  cacheUpdateLatency?: number;          // Cache storage time (ms)

  // Result Counts
  cacheHit?: boolean;                   // Semantic cache hit?
  qdrantResultCount?: number;           // Vector search results
  hydeResultCount?: number;             // HyDE search results
  reformulationResultCount?: number;    // Reformulated query results
  rewriteResultCount?: number;          // Rewritten query results
  mysqlResultCount?: number;            // Metadata search results
  fusedResultCount?: number;            // After RRF
  deduplicatedCount?: number;           // Deduplication count
  whitelistDocCount?: number;           // Access-controlled docs
  rerankedResultCount?: number;         // After cross-encoder
  parentChunkCount?: number;            // Final enriched contexts

  // Quality Metrics
  sufficiencyScore?: number;            // Composite score (0-1)
  iterations?: number;                  // Adaptive loop iterations

  // Flags
  rerankFallbackTriggered?: boolean;    // Used RRF fallback?

  // Transformation Metrics
  transformationMetrics?: {
    reformulatedCount: number;
    decomposedCount: number;
    rewriteApplied: boolean;
    hydeApplied: boolean;
  };

  // Sub-Query Metrics
  subQueryMetrics?: {
    subQueriesExecuted: number;
    subQueryResultCount: number;
    subQueryDuration: number;
    aggregatedResultCount: number;
    decompositionReason: 'insufficient' | 'complex_query' | 'none';
  };
}
```

### Observability Stack

**1. Structured Logging (Pino):**
- Format: JSON (file) + Pretty (console)
- Levels: debug, info, warn, error
- Fields: requestId, traceId, userId, userEmail, service
- Output: `/logs/ltv-assistant-retrieval.log`
- Redaction: Authorization headers, API keys, tokens

**2. OpenTelemetry Tracing:**
- Exporter: OTLP HTTP (Jaeger/Tempo)
- Service Name: `ltv-assistant-retrieval`
- Instrumentation: HTTP, Express, NestJS
- Endpoint: `OTEL_EXPORTER_OTLP_ENDPOINT` (default: http://localhost:4318/v1/traces)

**3. Request-Level Tracking:**
- Request ID: `X-Request-Id` header
- Trace ID: `X-Trace-Id` header
- User ID: `X-User-Id` header
- User Email: `X-User-Email` header

---

## 7. DATA MODELS

### Input DTOs

**QueryRequestDto:**
```typescript
{
  query: string;                    // User question
  mode?: "retrieval_only" | "generation";  // Output mode
  topK?: number;                    // 1-50 results (default: 10)
  useCache?: boolean;               // Cache control (default: true)
}
```

### Output DTOs

**RetrievalResultDto:**
```typescript
{
  contexts: Context[];
  metrics: RetrievalMetricsDto;
  cached: boolean;
}
```

**RetrievalMetricsDto:**
```typescript
{
  totalDuration: number;
  cacheHit: boolean;
  qdrantResultCount: number;
  rerankedResultCount: number;
  parentChunkCount: number;
  iterations: number;
  sufficiencyScore: number;
}
```

### Internal Type Hierarchy

```typescript
// ========== Input ==========
QueryRequest {
  query: string;
  mode?: "retrieval_only" | "generation";
  topK?: number;
  useCache?: boolean;
}

UserContext {
  userId: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
}

// ========== Retrieval Sources ==========
QdrantResult {
  chunkId: string;
  parentChunkId: string;
  documentId: string;
  content: string;              // Full chunk content
  score: number;                // Vector similarity score
  metadata: Record<string, unknown>;
}

DocumentMetadata {
  documentId: string;
  title: string;
  description?: string;
  type: string;
  fileType?: string;
  chunkIds: string[];
  metadata?: Record<string, unknown>;
}

// ========== Processing Stages ==========
FusedResult {
  chunkId: string;
  parentChunkId: string;
  documentId: string;
  content: string;
  rrfScore: number;             // RRF composite score
  sources: string[];            // ["qdrant", "hyde", ...]
  originalScores: Record<string, number>;
  documentMetadata?: { title, description, type, fileType };
}

RerankedResult {
  chunkId: string;
  parentChunkId: string;
  documentId: string;
  content: string;
  rerankScore: number;          // Cross-encoder score
  rrfScore: number;
}

EnrichedContext {
  parentChunkId: string;
  documentId: string;
  content: string;              // Parent chunk content
  tokens: number;
  metadata: {
    sectionPath?: string[];
    pageNumber?: number;
    documentTitle?: string;
    documentType?: string;
  };
  childChunks: Array<{
    chunkId: string;
    content: string;
    rerankScore: number;
  }>;
  bestScore: number;            // Best child score
}

// ========== Output ==========
Context {
  parentChunkId: string;
  documentId: string;
  content: string;              // Parent (~1800 tokens)
  tokens: number;
  score: number;                // Best score (rerank or RRF)
  metadata: Record<string, unknown>;
  sources: {
    childChunks: Array<{
      chunkId: string;
      content: string;          // Child (~512 tokens)
      score: number;
    }>;
  };
}
```

### Database Schema (MySQL - Read-Only)

**parentChunks Table:**
```typescript
{
  id: varchar(255) PRIMARY KEY,
  fileId: varchar(255) NOT NULL,  // Foreign key to datasource.files
  content: text NOT NULL,         // ~1800 tokens
  tokens: int NOT NULL,
  chunkIndex: int NOT NULL,
  metadata: json,                 // sectionPath, pageNumber, etc.
  createdAt: timestamp,
  idx: (fileId)
}
```

**childChunks Table:**
```typescript
{
  id: varchar(255) PRIMARY KEY,
  fileId: varchar(255) NOT NULL,
  parentChunkId: varchar(255) NOT NULL,  // FK to parentChunks
  content: text NOT NULL,         // ~512 tokens
  tokens: int NOT NULL,
  chunkIndex: int NOT NULL,
  metadata: json,
  createdAt: timestamp,
  idx: (fileId, parentChunkId)
}
```

**chunkLineage Table:**
```typescript
{
  id: int PRIMARY KEY AUTO_INCREMENT,
  parentChunkId: varchar(255) NOT NULL,  // FK
  childChunkId: varchar(255) NOT NULL,   // FK
  childOrder: int NOT NULL,              // Sequence position
  createdAt: timestamp,
  idx: (parentChunkId, childChunkId)
}
```

---

## 8. EXTERNAL DEPENDENCIES

### Required Services

| Service | Type | Purpose | Communication | Required? |
|---------|------|---------|---|---|
| **Qdrant** | Vector DB | Vector search + cache storage | REST API (HTTP) | YES |
| **MySQL** | Relational DB | Parent/child chunk storage | JDBC (Drizzle ORM) | YES |
| **TEI (BGE-Reranker)** | ML Model | Cross-encoder reranking | REST API (HTTP) | NO (graceful fallback) |
| **Auth Service** | Microservice | JWT validation | TCP (NestJS microservice) | YES |
| **Datasource Service** | Microservice | Document metadata + access control | TCP (NestJS microservice) | YES |

### Environment Configuration

```bash
# Qdrant
QDRANT_URL=http://localhost:6333

# MySQL
DATABASE_URL=mysql://user:pass@localhost:3306/retrieval_db

# TEI Reranker
TEI_RERANKER_URL=http://localhost:8080
TEI_RERANKER_TIMEOUT=30000

# LLM Providers (for query transformation)
LLM_PROVIDER=ollama|openai|google|anthropic
OLLAMA_BASE_URL=http://localhost:11434
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
ANTHROPIC_API_KEY=...

# Cache
CACHE_ENABLED=true
CACHE_COLLECTION_NAME=query_cache_public
CACHE_SIMILARITY_THRESHOLD=0.95
CACHE_TTL=3600

# Workflow
SUFFICIENCY_THRESHOLD=0.6
HIGH_QUALITY_THRESHOLD=0.7
MIN_CONTEXTS=3
MAX_RETRY_ITERATIONS=3
RERANK_SCORE_THRESHOLD=0.0

# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
NODE_ENV=production|development
SERVICE_NAME=ltv-assistant-retrieval
APP_VERSION=1.0.0

# Logging
LOG_LEVEL=info
LOG_DIR=/var/log/ltv-assistant
```

---

## 9. ERROR HANDLING

### Error Categories

**1. Non-Critical Errors (Graceful Degradation):**
- Cache lookup failures → Continue to full retrieval
- HyDE generation failures → Continue without HyDE
- Reformulation failures → Continue with main query
- Reranker unavailability → Fallback to RRF scores
- MySQL lookup failures → Continue without parent enrichment

**2. Critical Errors (Workflow Failure):**
- Query embedding generation failure
- Qdrant connection/search failure
- Access filter construction failure
- Invalid workflow state

### Error Handling Patterns

**Pattern 1: Try-Catch with Non-Critical Fallback**
```typescript
// In each node:
try {
  const results = await someService.search();
  return { ...state, results };
} catch (error) {
  logger.warn(`Non-critical error: ${error.message}`);
  return { ...state, results: [] };  // Graceful fallback
}
```

**Pattern 2: Conditional Fallback**
```typescript
// Reranker failure → Use RRF scores
if (rerankerFailed) {
  return fusedResults.map(r => ({
    ...r,
    rerankScore: r.rrfScore  // Fallback to RRF
  }));
}
```

**Pattern 3: Non-Essential Skip**
```typescript
// If cache disabled or unavailable
if (!cacheEnabled || cacheError) {
  return { cacheHit: false };  // Continue workflow
}
```

### Logging Strategy

**Log Levels:**
- **ERROR:** Critical failures (workflow abort required)
- **WARN:** Non-critical issues (graceful fallback)
- **INFO:** Stage transitions, key decisions
- **DEBUG:** Detailed metrics per stage (suppressed in prod)

**Log Format (JSON):**
```json
{
  "stage": "5_hybrid_retrieval",
  "substage": "qdrant",
  "status": "success|error|warning",
  "duration": 123,
  "message": "Human-readable message",
  "requestId": "uuid",
  "traceId": "uuid",
  "userId": "user123",
  "context": { "topK": 10, "queryLength": 45 }
}
```

---

## 10. BUSINESS LOGIC - CONVERSATION HANDLING & CONTEXT MANAGEMENT

### User Context Management

**Context Source:** API Gateway (via JWT validation)

```typescript
interface CurrentUserData {
  userId: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
}
```

**Access Control:**
1. **Role-Based Filtering:**
   - SUPER_ADMIN: Access all documents (public + private + shared)
   - ADMIN: Access own documents + shared with them
   - USER: Access public + documents shared with them

2. **Document Whitelist:**
   - Retrieved from datasource service via TCP
   - Embedded in Qdrant filters
   - Applied during vector search

3. **Permission Re-validation:**
   - Final context check before response
   - Prevents stale permission leaks

### Answer Generation (Future)

**Current Status:** Retrieval-only mode  
**Future:** Generation mode (to be implemented)

**Planned Flow:**
```
Retrieval → Contexts → LLM Generation → Answer
```

**Generation Parameters:**
- LLM Provider: (configurable)
- System Prompt: (task-specific)
- Context Injection: Top-K contexts
- Temperature: (configured per use case)

---

## 11. MONITORING & OBSERVABILITY

### Key Monitoring Dimensions

#### Operational Health
- **Qdrant Availability:** Connection status, latency
- **MySQL Availability:** Query performance, connection pool
- **TEI Reranker Availability:** Response time, error rate
- **Auth Service:** JWT validation latency

#### Performance Metrics
- **Total Duration P95:** < 1500ms (target)
- **Cache Hit Latency:** 20-50ms
- **Full Retrieval Latency:** 300-1500ms
- **Stage Duration Distribution:**
  - Query Analysis: 50-200ms
  - Access Filter: 10-50ms
  - Retrieval: 100-500ms
  - Fusion: 10-50ms
  - Reranking: 50-200ms
  - Enrichment: 20-100ms

#### Quality Metrics
- **Cache Hit Rate:** Target 15-30%
- **Sufficiency Score Distribution:** % queries at each band
- **Rerank Score Distribution:** Quality of reranking
- **Result Count Distribution:** topK effectiveness

#### Business Metrics
- **Query Volume:** Requests per minute/hour
- **User Segments:** Queries by role (SUPER_ADMIN, ADMIN, USER)
- **Query Types:** Distribution of transformation techniques used
- **Error Rate:** % failed queries
- **Retry Frequency:** How often adaptive loop triggers

### Grafana Dashboard Panels

**ltv-assistant-retrieval-dashboard.json contains:**

1. **Service Health Overview**
   - Qdrant connectivity
   - MySQL connectivity
   - Reranker availability
   - Overall status

2. **Performance Panels**
   - Total latency P50/P95/P99
   - Cache hit latency
   - Stage-by-stage duration breakdown
   - Request volume (requests/sec)

3. **Cache Metrics**
   - Hit rate %
   - Hit count vs miss count
   - Cache size (entries)
   - Invalidation events

4. **Retrieval Quality**
   - Sufficiency score distribution
   - Result count per stage
   - Transformation technique usage
   - Rerank score distribution

5. **Error Tracking**
   - Error rate by type
   - Failed queries timeline
   - Qdrant error rate
   - Reranker error rate

6. **Adaptive Loop**
   - Retry frequency
   - Decomposition triggers
   - Iteration distribution

7. **Query Analysis**
   - Query length distribution
   - Transformation success rates
   - HyDE generation frequency
   - Decomposition frequency

8. **User Activity**
   - Query volume by role
   - Unique users
   - Active sessions

### Metrics to Track for Super Admin Dashboard

**Critical KPIs:**
1. **System Health**
   - Service availability (%)
   - Error rate (%)
   - Dependency availability (Qdrant, MySQL, Reranker)

2. **Performance SLOs**
   - P95 latency vs target (1500ms)
   - Cache hit ratio (target: 15-30%)
   - Successful query % (target: 99%)

3. **Capacity Planning**
   - Query volume trends
   - Cache size growth
   - Database query patterns
   - Reranker usage

4. **User Engagement**
   - Active users per role
   - Query volume per user type
   - Feature adoption (cache usage, decomposition)

5. **Quality Metrics**
   - Sufficiency score trends
   - Rerank effectiveness
   - Result diversity
   - User satisfaction (if available)

---

## Summary: Architecture Components

### Microservices Architecture
```
┌─────────────────────┐
│   API Gateway       │  Port 50053 (HTTP)
│  (Auth + Routing)   │
└──────────┬──────────┘
           │
     ┌─────▼──────────────────┐
     │  Retrieval Service     │
     │  (ltv-assistant-       │
     │   retrieval)           │
     │                        │
     │  ┌──────────────────┐  │
     │  │ LangGraph        │  │ TCP: 4005
     │  │ Workflow         │  │
     │  └──────┬───────────┘  │
     └─────────┼──────────────┘
               │
     ┌─────────┼──────────────────────────┐
     │         │                          │
┌────▼──┐ ┌────▼────┐ ┌────────┐ ┌──────▼─────┐
│ Qdrant │ │ MySQL   │ │  TEI   │ │ Auth       │
│(Vector)│ │(Chunks) │ │Reranker│ │ Service    │
└────────┘ └─────────┘ └────────┘ └────────────┘
                                  (TCP)
                                  
┌─────────────────────────────────────────┐
│ Datasource Service (TCP)                │
│ • Document metadata                     │
│ • Access control whitelist              │
│ • File information                      │
└─────────────────────────────────────────┘
```

### Data Flow Summary
```
User Query (HTTP)
    ↓
[API Gateway Auth]
    ↓
[Retrieval Service - 11-Node Workflow]
    ├─→ Semantic Cache (hit? → END)
    ├─→ Query Transformation (4 techniques in parallel)
    ├─→ RBAC Filter Construction
    ├─→ Hybrid Multi-Source Retrieval
    │   ├─→ Qdrant (3 collections)
    │   ├─→ MySQL (metadata)
    │   └─→ Query Variants (reformulation, HyDE, etc.)
    ├─→ RRF Fusion (Reciprocal Rank Fusion)
    ├─→ Cross-Encoder Reranking
    ├─→ Small-to-Big Enrichment
    ├─→ Sufficiency Check (adaptive retry/decomposition)
    ├─→ Final Output Formatting
    ├─→ Cache Storage (public only)
    ↓
Enriched Contexts + Metrics (JSON)
    ↓
[API Gateway Response]
    ↓
Client Application
```

---

## Implementation Checklist Status

- ✅ Phase 1.5: Semantic Cache (checkCache, updateCache nodes)
- ✅ Phase 4: Query Transformation (analyzeQuery node)
- ✅ Phase 5: Hybrid Retrieval (hybridRetrieval, fusion nodes)
- ✅ Phase 5B: Query Decomposition Execution (executeSubQueries node)
- ✅ Phase 6: Reranking & Enrichment (rerank, enrich nodes)
- ✅ Phase 6: Adaptive Sufficiency (checkSufficiency, selectMode nodes)
- ✅ OpenTelemetry Tracing Integration
- ✅ Pino Structured Logging
- ✅ TCP Microservice Endpoints
- ✅ RBAC Access Control
- 🔲 Phase 2: Query-Level Redis Caching
- 🔲 Phase 3: GraphQL Integration
- 🔲 Streaming Responses

---

**End of Comprehensive Analysis**

This document provides a complete technical blueprint for monitoring, deploying, and maintaining the ltv-assistant-retrieval service.

