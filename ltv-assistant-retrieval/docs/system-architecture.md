# LTV Assistant Retrieval Service - System Architecture

## Overall Architecture Overview

The LTV Assistant Retrieval Service is built on a **state machine workflow architecture** using LangGraph.js, orchestrating multiple specialized retrieval stages into a cohesive pipeline. The architecture follows a modular, service-oriented design with clear separation of concerns.

### Architecture Principles

1. **State-Based Orchestration**: LangGraph manages workflow state transitions
2. **Modular Services**: Each retrieval concern (query transformation, vector search, reranking) is isolated
3. **Provider Abstraction**: Factory pattern enables multi-LLM provider support
4. **Graceful Degradation**: Fallback mechanisms ensure reliability
5. **Observability-First**: Comprehensive logging, tracing, and metrics at every stage
6. **Stateless Execution**: No session state, enabling horizontal scaling

## Component Breakdown

### 1. Application Layer

#### Main Application (main.ts)
- **Bootstrap Process**:
  1. Initialize OpenTelemetry tracer
  2. Create NestJS application with Pino logger
  3. Configure CORS for cross-origin requests
  4. Enable global validation pipe
  5. Connect TCP microservice (port 4005)
  6. Start HTTP server (port 50053)
  7. Register shutdown handlers (SIGTERM, SIGINT)

- **Dual Transport**:
  - **HTTP Server**: REST API for direct queries
  - **TCP Microservice**: Inter-service communication (CMS, API Gateway)

#### Root Module (AppModule)
```
AppModule
├── ConfigModule (global, .env)
├── LoggerModule (Pino, structured JSON)
├── CacheConfigModule (Redis)
├── DatabaseModule (MySQL, Drizzle ORM)
├── CommonModule (guards, decorators)
└── RetrievalModule (core domain)
```

### 2. Controller Layer

#### HTTP Controller (RetrievalController)
- **Endpoints**:
  - `POST /query`: Execute retrieval workflow
  - `GET /health`: Service health check

- **Responsibilities**:
  - Request validation (class-validator)
  - User authentication (GatewayAuthGuard)
  - User context extraction (@CurrentUser decorator)
  - Response formatting

#### TCP Controller (RetrievalTcpController)
- **Message Patterns**:
  - `{ cmd: 'query_contexts' }`: Main retrieval endpoint
  - `{ cmd: 'get_retrieval_health' }`: Health check

- **Responsibilities**:
  - Inter-service communication
  - Payload deserialization
  - Error serialization for TCP transport

### 3. Workflow Layer (LangGraph)

The workflow layer is the **core orchestrator** of the retrieval pipeline, implemented using LangGraph.js state machine.

#### Workflow Service (RetrievalWorkflowService)

**Initialization**:
```typescript
new StateGraph(RetrievalState)
  .addNode('checkCache', createCheckCacheNode(...))
  .addNode('analyzeQuery', createAnalyzeQueryNode(...))
  .addNode('buildAccessFilter', createBuildAccessFilterNode(...))
  .addNode('hybridRetrieval', createHybridRetrievalNode(...))
  .addNode('fusion', createFusionNode())
  .addNode('rerank', createRerankNode(...))
  .addNode('enrich', createEnrichNode(...))
  .addNode('checkSufficiency', createCheckSufficiencyNode(...))
  .addNode('selectMode', createSelectModeNode())
  .addNode('updateCache', createUpdateCacheNode(...))
  .addEdge(START, 'checkCache')
  .addConditionalEdges('checkCache', cacheRouter, { cache_hit: END, cache_miss: 'analyzeQuery' })
  .addEdge('analyzeQuery', 'buildAccessFilter')
  .addEdge('buildAccessFilter', 'hybridRetrieval')
  .addEdge('hybridRetrieval', 'fusion')
  .addEdge('fusion', 'rerank')
  .addEdge('rerank', 'enrich')
  .addEdge('enrich', 'checkSufficiency')
  .addConditionalEdges('checkSufficiency', retryRouter, { retry: 'analyzeQuery', continue: 'selectMode' })
  .addEdge('selectMode', 'updateCache')
  .addEdge('updateCache', END)
  .compile();
```

**Execution Flow**:
```
START
  ↓
checkCache (Phase 1.5: Semantic Cache)
  ├─ cache_hit → END (return cached contexts)
  └─ cache_miss ↓
analyzeQuery (Phase 4: Query Transformation) ← ┐ (retry loop)
  ↓                                              │
buildAccessFilter (Phase 5: RBAC)               │
  ↓                                              │
hybridRetrieval (Phase 5: Multi-Source)         │
  ↓                                              │
fusion (Phase 5: RRF Fusion)                    │
  ↓                                              │
rerank (Phase 6: Cross-Encoder)                 │
  ↓                                              │
enrich (Phase 6: Small-to-Big)                  │
  ↓                                              │
checkSufficiency (Phase 6: Quality Check)       │
  ├─ shouldRetry=true ──────────────────────────┘
  └─ shouldRetry=false ↓
selectMode (Phase 6: Final Output)
  ↓
updateCache (Phase 1.5: Cache Update)
  ↓
END
```

#### Workflow State (RetrievalState)

**State Fields** (40+ fields organized by stage):

```typescript
// Input (from request)
query: string
mode: 'retrieval_only' | 'generation'
topK: number
userId: string
userRole: 'SUPER_ADMIN' | 'ADMIN' | 'USER'
userEmail: string

// Cache control (Phase 1.5)
useCache: boolean
cacheHit: boolean
cacheLatency: number | null

// Pre-retrieval (Phase 4)
queryEmbedding: number[] | null
hydeEmbedding: number[] | null
reformulatedQueries: string[]
rewrittenQuery: string | null
hypotheticalDoc: string | null
decomposedQueries: string[]

// Access control (Phase 5)
accessFilter: AccessFilter | null
whitelistDocIds: string[]

// Retrieval (Phase 5)
qdrantResults: QdrantResult[]
mysqlResults: DocumentMetadata[]
fusedResults: FusedResult[]

// Post-retrieval (Phase 6)
rerankedResults: RerankedResult[]
enrichedContexts: EnrichedContext[]

// Adaptive loop (Phase 6)
iterations: number
sufficiencyScore: number
shouldRetry: boolean

// Output
finalContexts: Context[]

// Metadata
currentStage: string
errors: string[]
metrics: WorkflowMetrics
cachedResult: boolean
```

### 4. Service Layer

#### Query Transformation Service

**Purpose**: Apply 4 query transformation techniques to improve retrieval recall.

**Techniques**:

1. **Query Reformulation** (temp=0.7)
   - Generate 3-5 query variations
   - Use synonyms and alternative phrasings
   - Increase recall by covering more semantic space

2. **Query Rewriting** (temp=0.3)
   - Clarify query intent
   - Expand abbreviations
   - Make search-friendly

3. **HyDE (Hypothetical Document Embeddings)** (temp=0.5)
   - Generate hypothetical answer
   - Embed answer instead of query
   - Match document style better

4. **Query Decomposition** (temp=0.4)
   - Break complex queries into 2-4 sub-queries
   - Retrieve for each sub-query
   - Combine results

**Execution Pattern**: Parallel execution with 10s timeout per technique, fallback on failure.

#### Vector Search Service (QdrantService)

**Purpose**: Dense vector similarity search in Qdrant.

**Operations**:
- **Search**: Similarity search with filters
- **Batch Search**: Multiple embeddings in parallel
- **Filter Construction**: Convert RBAC rules to Qdrant filters
- **Collection Management**: Verify collections exist
- **Health Check**: Validate connectivity

**Qdrant Collections**:
- `chunks`: Main chunk embeddings (BGE-M3, 1024 dim)
- `query_cache_public`: Semantic cache for public queries
- `query_cache_private_{userId}`: User-specific cache

**Search Algorithm**:
```
1. Generate query embedding (or use HyDE embedding)
2. Build Qdrant filter from access control
3. Execute similarity search (HNSW index)
4. Apply score threshold (configurable)
5. Return top-K results
```

#### MySQL Service

**Purpose**: Structured queries for chunk metadata and lineage.

**Operations**:
- **Get Parent Chunks**: Retrieve parent chunks by IDs
- **Get Child Chunks**: Retrieve child chunks for parents
- **Get Lineage**: Fetch parent-child relationships
- **Batch Queries**: Optimize with IN clauses
- **Document Metadata**: Join with datasource database

**Drizzle ORM Queries**:
```typescript
// Get parent chunks with children
const parents = await db
  .select()
  .from(parentChunks)
  .where(inArray(parentChunks.id, parentIds));

const children = await db
  .select()
  .from(childChunks)
  .where(inArray(childChunks.parentChunkId, parentIds));
```

#### Reranker Service

**Purpose**: Cross-encoder reranking using BGE-Reranker-v2-m3 via TEI.

**Process**:
1. Accept query + candidate results (from fusion)
2. Format as query-document pairs
3. Send batch request to TEI endpoint
4. Receive raw scores (can be negative)
5. Filter by threshold (default: 0.3)
6. Fallback to top-N if all filtered (default: 3)
7. Return reranked results

**TEI Request Format**:
```json
{
  "query": "user query",
  "texts": ["candidate 1", "candidate 2", ...]
}
```

**Response**:
```json
[
  { "index": 0, "score": 0.85 },
  { "index": 1, "score": 0.42 },
  ...
]
```

**Fallback Logic**:
```
if (filteredResults.length === 0 && rerankedResults.length > 0):
  # Threshold too aggressive, use fallback
  topKResults = rerankedResults.slice(0, RERANK_FALLBACK_COUNT)
  metrics.rerankFallbackTriggered = true
else:
  topKResults = filteredResults.slice(0, topK)
```

#### Cache Service (QdrantCacheService)

**Purpose**: Semantic cache using vector similarity.

**Cache Entry Structure**:
```typescript
{
  id: uuid(),
  vector: queryEmbedding,  // BGE-M3 1024-dim
  payload: {
    query: originalQuery,
    contexts: Context[],
    userId: string,
    createdAt: timestamp,
    expiresAt: timestamp + TTL,
  }
}
```

**Cache Operations**:

1. **Lookup** (checkCache node):
   ```
   1. Generate query embedding
   2. Search cache collection (similarity > 0.95)
   3. If found and not expired:
      - Return cached contexts
      - Update cacheHit metrics
   4. Else: Continue to full retrieval
   ```

2. **Update** (updateCache node):
   ```
   1. Store query embedding
   2. Store result contexts
   3. Set TTL (default: 1 hour)
   4. Update cache metrics
   ```

3. **Cleanup** (scheduled cron):
   ```
   1. Find expired entries (createdAt + TTL < now)
   2. Delete expired entries
   3. Log cleanup statistics
   ```

**Cache Invalidation**:
- **Time-based**: TTL expiration (default: 1 hour)
- **Event-based**: Document updates (via CacheInvalidationService)
- **Manual**: Admin API (future)

### 5. Provider Layer

#### LLM Provider Factory

**Purpose**: Abstract LLM provider differences, enable multi-provider support.

**Supported Providers**:

| Provider | Chat Model | Embedding Model | Default Config |
|----------|-----------|-----------------|----------------|
| OpenAI | GPT-4o | text-embedding-3-small | temp=0.7, maxTokens=200 |
| Google | Gemini-2.5-flash-lite | text-embedding-004 | temp=0.7, maxTokens=200 |
| Anthropic | Claude Sonnet 4.5 | N/A | temp=0.7, maxTokens=200 |
| Ollama | gemma3:1b | bge-m3:567m | temp=0.7, maxTokens=200 |

**Factory Pattern**:
```typescript
class LLMProviderFactory {
  createChatModel(provider: string, options?: ChatModelOptions): ChatModel {
    const config = this.getConfig(provider, options);

    switch(provider) {
      case 'openai':
        return new ChatOpenAI({
          apiKey: config.apiKey,
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        });

      case 'google':
        return new ChatGoogleGenerativeAI({
          apiKey: config.apiKey,
          model: config.model,
          temperature: config.temperature,
          maxOutputTokens: config.maxTokens,
        });

      // ... more providers
    }
  }
}
```

**Fallback Strategy**:
- Primary: Configured provider (env: LLM_PROVIDER)
- Fallback: Ollama (local, always available)
- Per-feature override: QUERY_REFORMULATION_PROVIDER, etc.

#### Embedding Provider Factory

**Similar pattern** for embeddings:
- Batch processing (up to 24 texts)
- Retry with exponential backoff
- Dimension validation (1024 for BGE-M3)
- Rate limiting awareness

### 6. Client Layer

#### Datasource TCP Client

**Purpose**: Communicate with ltv-assistant-datasource service for document metadata and permissions.

**TCP Endpoints Used**:

1. **get_user_documents** (RBAC):
   ```typescript
   Request: { userId: string, role: string }
   Response: { documentIds: string[] }
   ```

2. **get_document_metadata** (Enrichment):
   ```typescript
   Request: { documentIds: string[] }
   Response: { documents: DocumentMetadata[] }
   ```

**Connection Management**:
- TCP connection pooling
- Timeout: 5s per request
- Retry on transient failures
- Graceful degradation (continue without metadata)

## Data Flow Through the System

### End-to-End Request Flow

```
1. User Request
   ├─ HTTP: POST /query { query, topK, mode }
   └─ TCP: { cmd: 'query_contexts', query, userId, userRole, ... }

2. Controller Layer
   ├─ Validate request (class-validator)
   ├─ Extract user context (auth guard)
   └─ Forward to WorkflowService

3. Workflow Execution
   ├─ Initialize state (createInitialState)
   └─ Execute graph (workflow.invoke(state))

4. Phase 1.5: Cache Check
   ├─ Generate query embedding
   ├─ Search cache collection (similarity > 0.95)
   └─ If HIT: Return cached contexts → END
      If MISS: Continue to Phase 4

5. Phase 4: Query Analysis
   ├─ Parallel execution:
   │  ├─ Generate query embedding (BGE-M3)
   │  ├─ Reformulate query (3-5 variations)
   │  ├─ Rewrite query (clarify intent)
   │  ├─ Generate HyDE (hypothetical answer)
   │  └─ Decompose query (2-4 sub-queries)
   └─ Update state with transformations

6. Phase 5: Access Control
   ├─ Call datasource service (TCP)
   ├─ Get user's document whitelist
   ├─ Build Qdrant filter (RBAC)
   └─ Update state with accessFilter

7. Phase 5: Multi-Source Retrieval
   ├─ Parallel retrieval:
   │  ├─ Qdrant: Dense+sparse vector search
   │  └─ MySQL: Metadata search (if needed)
   └─ Update state with results

8. Phase 5: Result Fusion
   ├─ Deduplicate by chunkId
   ├─ Apply RRF algorithm (K=60)
   ├─ Combine scores across sources
   └─ Sort by RRF score

9. Phase 6: Reranking
   ├─ Send to TEI reranker (batch)
   ├─ Filter by threshold (0.3)
   ├─ Fallback if all filtered (top 3)
   └─ Update state with reranked results

10. Phase 6: Enrichment
    ├─ Get parent chunks from MySQL
    ├─ Group child chunks by parent
    ├─ Calculate best score per parent
    └─ Update state with enriched contexts

11. Phase 6: Sufficiency Check
    ├─ Calculate sufficiency score
    ├─ If insufficient AND iterations < MAX:
    │  └─ Retry from Phase 4 (with adjusted params)
    └─ Else: Continue to final output

12. Phase 6: Mode Selection
    ├─ Format final contexts
    ├─ Add metadata (document title, etc.)
    └─ Update state with finalContexts

13. Phase 1.5: Cache Update
    ├─ Store query embedding
    ├─ Store final contexts
    ├─ Set TTL (1 hour)
    └─ Update metrics

14. Response
    ├─ Extract contexts and metrics from state
    ├─ Format response DTO
    └─ Return to client
```

### Data Transformations

```
User Query (string)
  ↓ (embedding)
Query Embedding (number[1024])
  ↓ (vector search)
QdrantResult[] { chunkId, score, content, metadata }
  ↓ (metadata lookup)
DocumentMetadata[] { documentId, chunkIds, title }
  ↓ (fusion - RRF)
FusedResult[] { chunkId, rrfScore, sources, content }
  ↓ (reranking)
RerankedResult[] { chunkId, rerankScore, content }
  ↓ (enrichment)
EnrichedContext[] { parentChunkId, content, childChunks[] }
  ↓ (formatting)
Context[] { parentChunkId, content, tokens, score, metadata, sources }
  ↓ (response)
RetrievalResult { contexts, metrics, cached }
```

## Integration Points with External Services

### 1. Qdrant Vector Database

**Connection**:
- Protocol: HTTP REST
- Client: @qdrant/js-client-rest
- Endpoint: http://localhost:6333

**Collections**:
- `chunks`: Main embeddings (1024 dim)
- `query_cache_public`: Public query cache
- `query_cache_private_{userId}`: User-specific cache

**Operations**:
- Search (POST /collections/{name}/points/search)
- Upsert (PUT /collections/{name}/points)
- Delete (POST /collections/{name}/points/delete)
- Get Collection Info (GET /collections/{name})

### 2. MySQL Database

**Connection**:
- Protocol: MySQL wire protocol
- Driver: mysql2
- ORM: Drizzle ORM
- Database: ltv_assistant_indexing_db

**Tables**:
- parent_chunks
- child_chunks
- chunk_lineage

**Connection Pool**:
- Min: 2
- Max: 10
- Idle timeout: 30s

### 4. Redis Cache

**Connection**:
- Protocol: Redis wire protocol
- Client: ioredis
- Endpoint: redis://localhost:6379

**Usage**:
- Cache manager (NestJS @nestjs/cache-manager)
- Future: Workflow checkpointer (LangGraph)
- Future: Pub/sub for cache invalidation

### 5. BGE-Reranker (TEI)

**Connection**:
- Protocol: HTTP
- Client: axios
- Endpoint: http://localhost:6201

**Model**: BAAI/bge-reranker-v2-m3

**API**:
- POST /rerank
- Body: { query, texts[] }
- Response: [{ index, score }]

**Timeout**: 30s (configurable)

### 6. LTV Assistant Datasource Service

**Connection**:
- Protocol: TCP microservice
- Transport: @nestjs/microservices
- Endpoint: tcp://localhost:4004

**Message Patterns**:
- get_user_documents
- get_document_metadata

### 7. OpenTelemetry Collector

**Connection**:
- Protocol: OTLP HTTP
- Exporter: @opentelemetry/exporter-trace-otlp-http
- Endpoint: http://localhost:4318/v1/traces

**Data**:
- Distributed traces
- Span attributes
- Service name: ltv-assistant-retrieval

## Workflow Stages (Detailed)

### Phase 1.5: Semantic Cache

**Nodes**: checkCache, updateCache

**checkCache Algorithm**:
```python
1. If useCache == false:
   return { cacheHit: false }

2. embedding = await embedQuery(state.query)

3. cacheResults = await qdrantCache.search(
     collection: getCacheCollection(userId, userRole),
     embedding: embedding,
     limit: 1,
     scoreThreshold: 0.95
   )

4. If cacheResults.length > 0:
   cached = cacheResults[0]
   If cached.expiresAt > now:
     return {
       cacheHit: true,
       cacheLatency: duration,
       finalContexts: cached.payload.contexts,
       cachedResult: true
     }

5. return { cacheHit: false }
```

**updateCache Algorithm**:
```python
1. If state.cachedResult == true:
   return {}  # Skip update if result from cache

2. embedding = state.queryEmbedding

3. entry = {
     id: uuid(),
     vector: embedding,
     payload: {
       query: state.query,
       contexts: state.finalContexts,
       userId: state.userId,
       createdAt: now,
       expiresAt: now + CACHE_TTL
     }
   }

4. await qdrantCache.upsert(entry)

5. return { metrics: { cacheUpdateLatency: duration } }
```

### Phase 4: Query Analysis and Transformation

**Node**: analyzeQuery

**Parallel Execution**:
```typescript
const [
  queryEmbedding,
  reformulated,
  rewritten,
  hypothetical,
  decomposed
] = await Promise.allSettled([
  embedder.embedQuery(state.query),
  transformService.reformulateQuery(state.query),
  transformService.rewriteQuery(state.query),
  transformService.generateHyDE(state.query),
  transformService.decomposeQuery(state.query),
]);

// Extract successful results, use null for failures
const updates = {
  queryEmbedding: getOrNull(queryEmbedding),
  reformulatedQueries: getOrEmpty(reformulated),
  rewrittenQuery: getOrNull(rewritten),
  hypotheticalDoc: getOrNull(hypothetical),
  decomposedQueries: getOrEmpty(decomposed),
};
```

**Total Timeout**: 30s (configurable: QUERY_TRANSFORMATION_TOTAL_TIMEOUT)

### Phase 5: Access Control Filter

**Node**: buildAccessFilter

**Algorithm**:
```python
1. If userRole == 'SUPER_ADMIN':
   return {
     accessFilter: {
       role: 'SUPER_ADMIN',
       publicAccess: true,
       whitelistDocIds: [],
       qdrantFilter: {}  # No filter - access all
     }
   }

2. whitelistDocIds = await datasourceClient.send({
     cmd: 'get_user_documents',
     userId: state.userId,
     role: state.userRole
   })

3. qdrantFilter = {
     should: [
       { key: 'access', match: { value: 'public' } },
       { key: 'documentId', match: { value: whitelistDocIds } }
     ]
   }

4. return {
     accessFilter: {
       role: state.userRole,
       publicAccess: false,
       whitelistDocIds: whitelistDocIds,
       qdrantFilter: qdrantFilter
     },
     whitelistDocIds: whitelistDocIds
   }
```

### Phase 5: Hybrid Retrieval

**Node**: hybridRetrieval

**Parallel Multi-Source**:
```typescript
const qdrantResults = await qdrantService.search(
  state.queryEmbedding,
  state.accessFilter?.qdrantFilter,
  state.topK,
  state.query,
);

// MySQL metadata search (optional, based on query type)
const mysqlResults = await datasourceClient.searchDocumentsByMetadata(
  state.query,
  state.accessFilter?.whitelistDocIds ?? [],
  Math.floor(state.topK / 2),
);

return {
  qdrantResults,
  mysqlResults,
  metrics: {

```

### Phase 5: Result Fusion

**Node**: fusion

**RRF (Reciprocal Rank Fusion) Algorithm**:
```python
K = 60  # Constant for RRF

# Collect all results with source tags
allResults = [
  ...qdrantResults.map(r => ({ ...r, source: 'qdrant' })),
  ...mysqlResults.map(r => ({ ...r, source: 'mysql' })),
]

# Group by chunkId (deduplication)
grouped = groupBy(allResults, 'chunkId')

# Calculate RRF score for each chunk
fusedResults = grouped.map(group => {
  rrfScore = sum(group.map(result =>
    1 / (K + result.rank)
  ))

  return {
    chunkId: group.chunkId,
    parentChunkId: group.parentChunkId,
    documentId: group.documentId,
    content: group.content,
    rrfScore: rrfScore,
    sources: unique(group.map(r => r.source)),
    originalScores: {
      qdrant: group.find(r => r.source == 'qdrant')?.score,
      ...
    }
  }
})

# Sort by RRF score descending
fusedResults.sort((a, b) => b.rrfScore - a.rrfScore)

return { fusedResults }
```

### Phase 6: Reranking

**Node**: rerank

**Cross-Encoder Algorithm**:
```python
1. pairs = fusedResults.map(r => ({
     query: state.query,
     text: r.content
   }))

2. scores = await rerankerService.rerank(state.query, fusedResults)
   # TEI returns raw scores (can be negative)

3. reranked = fusedResults.map((r, i) => ({
     ...r,
     rerankScore: scores[i].score
   }))

4. threshold = config.get('RERANK_SCORE_THRESHOLD', 0.3)
   filtered = reranked.filter(r => r.rerankScore > threshold)

5. If filtered.length == 0 AND reranked.length > 0:
     # Fallback: threshold too aggressive
     fallbackCount = config.get('RERANK_FALLBACK_COUNT', 3)
     topKResults = reranked.slice(0, fallbackCount)
     metrics.rerankFallbackTriggered = true
   Else:
     topKResults = filtered.slice(0, state.topK)

6. return {
     rerankedResults: topKResults,
     metrics: {
       rerankedResultCount: topKResults.length,
       rerankFallbackTriggered: fallbackTriggered
     }
   }
```

### Phase 6: Small-to-Big Enrichment

**Node**: enrich

**Algorithm**:
```python
1. parentChunkIds = unique(rerankedResults.map(r => r.parentChunkId))

2. [parents, children] = await Promise.all([
     mysqlService.getParentChunks(parentChunkIds),
     mysqlService.getChildChunksByParents(parentChunkIds)
   ])

3. enriched = parents.map(parent => {
     childrenOfParent = rerankedResults.filter(r =>
       r.parentChunkId == parent.id
     )

     bestScore = max(childrenOfParent.map(c => c.rerankScore))

     return {
       parentChunkId: parent.id,
       documentId: parent.fileId,
       content: parent.content,
       tokens: parent.tokens,
       metadata: parent.metadata,
       childChunks: childrenOfParent.map(c => ({
         chunkId: c.chunkId,
         content: c.content,
         rerankScore: c.rerankScore
       })),
       bestScore: bestScore
     }
   })

4. enriched.sort((a, b) => b.bestScore - a.bestScore)

5. return { enrichedContexts: enriched }
```

### Phase 6: Sufficiency Check

**Node**: checkSufficiency

**Quality Assessment**:
```python
1. If state.iterations >= MAX_RETRY_ITERATIONS:
   return { shouldRetry: false }

2. # Calculate sufficiency score (0-1)
   sufficiencyScore = calculateSufficiency(state.enrichedContexts, state.query)

   # Factors:
   # - Number of contexts (weight: 0.3)
   # - Average rerank score (weight: 0.4)
   # - Content diversity (weight: 0.3)

3. threshold = config.get('SUFFICIENCY_THRESHOLD', 0.6)

   If sufficiencyScore < threshold:
     # Quality insufficient, retry with adjusted params
     return {
       iterations: state.iterations + 1,
       sufficiencyScore: sufficiencyScore,
       shouldRetry: true
     }
   Else:
     return {
       sufficiencyScore: sufficiencyScore,
       shouldRetry: false
     }
```

### Phase 6: Mode Selection

**Node**: selectMode

**Output Formatting**:
```python
1. finalContexts = state.enrichedContexts.map(enriched => ({
     parentChunkId: enriched.parentChunkId,
     documentId: enriched.documentId,
     content: enriched.content,
     tokens: enriched.tokens,
     score: enriched.bestScore,
     metadata: enriched.metadata,
     sources: {
       childChunks: enriched.childChunks.map(child => ({
         chunkId: child.chunkId,
         content: child.content,
         score: child.rerankScore
       }))
     }
   }))

2. return {
     finalContexts: finalContexts,
     currentStage: 'complete',
     metrics: {
       ...state.metrics,
       endTime: Date.now(),
       totalDuration: Date.now() - state.metrics.startTime
     }
   }
```

## State Management with LangGraph

### State Immutability

LangGraph enforces **immutable state updates**:
```typescript
// Node returns partial state update
async function myNode(state: RetrievalStateType): Promise<Partial<RetrievalStateType>> {
  // NEVER mutate state directly
  // state.field = value; // ❌ BAD

  // Return partial update
  return {
    field: newValue,
    metrics: {
      ...state.metrics,  // Spread existing
      newMetric: 123,
    }
  }; // ✅ GOOD
}
```

### State Transitions

**Graph ensures type safety**:
```typescript
const RetrievalState = Annotation.Root({
  query: Annotation<string>,
  results: Annotation<Result[]>,
  // ... more fields
});

// TypeScript infers: typeof RetrievalState.State
type RetrievalStateType = {
  query: string;
  results: Result[];
  // ...
}
```

### Conditional Routing

**Type-safe routing functions**:
```typescript
.addConditionalEdges(
  'checkCache',
  (state: RetrievalStateType): 'cache_hit' | 'cache_miss' => {
    return state.cacheHit ? 'cache_hit' : 'cache_miss';
  },
  {
    cache_hit: END,
    cache_miss: 'analyzeQuery',
  }
)
```

## Scaling and Performance

### Horizontal Scaling

**Stateless Design**:
- No session state stored in service
- Each request independent
- Can run multiple instances
- Load balancer distributes requests

**Docker Deployment**:
```yaml
services:
  retrieval:
    image: ltv-assistant-retrieval:latest
    replicas: 3
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
```

### Performance Optimizations

1. **Batch Processing**:
   - Embed up to 24 queries in parallel
   - Batch reranking (all results in one request)
   - MySQL IN clauses for bulk queries

2. **Connection Pooling**:
   - MySQL: 2-10 connections
   - Redis: Single persistent connection

3. **Caching Layers**:
   - L1: Semantic cache (Qdrant) - ~95% similar queries
   - L2: Redis cache (future) - Exact query matches
   - L3: In-memory (future) - Frequently accessed metadata

4. **Parallel Execution**:
   - Query transformations (4 techniques in parallel)
   - Multi-source retrieval (Qdrant + MySQL)

5. **Timeouts and Circuit Breakers**:
   - Per-service timeouts (configurable)
   - Graceful degradation on failures
   - Skip optional steps if timeout

### Resource Usage

**Typical Request**:
- Memory: ~50-100 MB per request
- CPU: 200-500 ms compute time
- Network: ~10-50 KB request/response
- Database queries: 3-7 queries
- LLM calls: 0-4 (if transformations enabled)

**Peak Load** (100 req/s):
- Memory: ~5-10 GB total
- CPU: 4-8 cores
- Network: 1-5 Mbps
- Database connections: 20-30 active

## Security Considerations

### Authentication and Authorization

1. **Request Authentication**:
   - Gateway validates JWT token
   - Passes user context to retrieval service
   - GatewayAuthGuard validates context

2. **Role-Based Access Control**:
   - Build Qdrant filter based on user role
   - SUPER_ADMIN: Access all documents
   - ADMIN/USER: Access public + owned documents
   - Enforce at retrieval level (defense in depth)

3. **User Context Validation**:
   ```typescript
   interface UserContext {
     userId: string;
     email: string;
     role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
   }

   // Validated by GatewayAuthGuard
   ```

### Data Protection

1. **Input Sanitization**:
   - class-validator for DTO validation
   - SQL injection prevention (Drizzle ORM)
   - NoSQL injection prevention (parameterized queries)

2. **Error Messages**:
   - No sensitive data in errors
   - Generic messages to clients
   - Detailed logs server-side only

3. **Cache Isolation**:
   - Separate cache collections per user
   - query_cache_public: Public queries only
   - query_cache_private_{userId}: User-specific

### Network Security

1. **Inter-Service Communication**:
   - TCP within trusted network
   - No authentication for internal TCP (network-level security)
   - Future: mTLS for production

2. **External APIs**:
   - API keys in environment variables
   - Never log API keys
   - Rate limiting awareness

## Monitoring and Observability

### Logging

**Structured JSON Logs** (Pino):
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

**OpenTelemetry Spans**:
```
Span: executeWorkflow (parent)
├─ Span: checkCache
├─ Span: analyzeQuery
│  ├─ Span: reformulateQuery
│  ├─ Span: rewriteQuery
│  ├─ Span: generateHyDE
│  └─ Span: decomposeQuery
├─ Span: buildAccessFilter
├─ Span: hybridRetrieval
│  ├─ Span: qdrantSearch
│  └─ Span: mysqlSearch
├─ Span: fusion
├─ Span: rerank
├─ Span: enrich
├─ Span: checkSufficiency
├─ Span: selectMode
└─ Span: updateCache
```

### Metrics

**Workflow Metrics**:
- totalDuration: End-to-end latency
- cacheHit: boolean
- qdrantResultCount: Results from vector search
- rerankedResultCount: Results after reranking
- parentChunkCount: Enriched contexts count
- iterations: Retry loop iterations
- sufficiencyScore: Quality score
- rerankFallbackTriggered: Fallback activation

**Service Health**:
- Qdrant connectivity
- MySQL connectivity
- Redis connectivity
- TEI reranker availability

## Deployment Architecture

### Docker Container

**Multi-Stage Build**:
1. Builder stage: Install deps, compile TypeScript
2. Production stage: Copy dist/, install production deps only
3. Non-root user (nestjs:nodejs)
4. Health check endpoint
5. dumb-init for signal handling

**Exposed Ports**:
- 50053: HTTP server
- 4005: TCP microservice

**Health Check**:
```bash
curl http://localhost:50053/health
```

### Environment Configuration

**80+ Environment Variables** organized by:
- Server config
- Database connections
- LLM providers
- Query transformations
- Retrieval parameters
- Cache settings
- Performance tuning
- Observability

See `.env.example` for full list.

### Service Dependencies

**Required**:
- MySQL (ltv_assistant_indexing_db)
- Qdrant (vector database)
- Redis (cache)

**Optional but Recommended**:
- BGE-Reranker TEI (cross-encoder)
- Datasource service (RBAC)

**Optional**:
- OpenTelemetry Collector (tracing)
- Prometheus (metrics)
- Grafana (dashboards)
