# LTV Assistant - Retrieval Service - Quick Reference Guide

**Last Updated:** 2025-11-14  
**Service Port:** HTTP 50053 | TCP 4005  
**Status:** ✅ Production-Ready (Phase 1.5 Semantic Cache)

---

## 1. Service Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    RETRIEVAL SERVICE                         │
│             (11-Node LangGraph Workflow)                     │
└─────────────────────────────────────────────────────────────┘

① checkCache         → Semantic cache lookup (0.95 threshold)
② analyzeQuery       → 4 parallel transformations + embedding
③ buildAccessFilter  → RBAC whitelist construction
④ hybridRetrieval    → Multi-source search (Qdrant + MySQL)
⑤ executeSubQueries  → Parallel decomposed query execution
⑥ fusion             → RRF algorithm (k=60) score aggregation
⑦ rerank             → Cross-encoder reranking (BGE-v2-m3)
⑧ enrich             → Small-to-Big parent chunk assembly
⑨ checkSufficiency   → Quality assessment + adaptive retry
⑩ selectMode         → Final output formatting
⑪ updateCache        → Store result (public docs only)
```

---

## 2. Key Endpoints

### HTTP (API Gateway Proxy)
```
POST /query
├─ Input:  { query, mode?, topK?, useCache? }
├─ Output: { contexts[], metrics{}, cached }
└─ Auth:   JWT via API Gateway
```

### TCP (Internal Microservices)
```
query_contexts         → Execute retrieval workflow
get_retrieval_health   → Health check for discovery
```

---

## 3. Critical Data Flow

```
User Query
    ↓
Cache Check (20-50ms)
    ├─ HIT  → Return cached + END
    └─ MISS ↓
Query Transform (100-300ms)
    • Reformulate (3-5 variations)
    • Rewrite (clarification)
    • HyDE (hypothetical answer)
    • Decompose (sub-queries)
    ↓
Multi-Source Retrieval (200-500ms)
    • Qdrant: children + summaries + questions (3 collections)
    • MySQL: document metadata
    • Query variants: reformulations, HyDE, rewrites
    ↓
RRF Fusion (10-50ms)
    ├─ Deduplicate by parentChunkId
    ├─ Aggregate RRF scores (k=60)
    └─ Buffer 1.5×topK for reranking
    ↓
Cross-Encoder Reranking (50-200ms)
    ├─ BGE-Reranker-v2-m3 via TEI
    ├─ Fallback: Use RRF scores if failed
    └─ Score threshold filter (>0.0)
    ↓
Small-to-Big Enrichment (20-100ms)
    ├─ Group children by parentChunkId
    ├─ Fetch parents from MySQL
    └─ Assemble contexts with metadata
    ↓
Sufficiency Check (10-50ms)
    ├─ Composite: 0.5×highQuality + 0.3×avgScore + 0.2×coverage
    ├─ If insufficient + retries left: Loop to ②
    ├─ If insufficient + no retries + decomposed: Execute ⑤
    └─ Otherwise: Continue
    ↓
Final Output + Cache Update (10-50ms)
    ├─ Format contexts (parent + child chunks)
    ├─ Cache if all public documents
    └─ Return with metrics
    ↓
Response (1000-1500ms P95 total)
```

---

## 4. Semantic Cache (Phase 1.5)

| Feature | Value |
|---------|-------|
| **Type** | Vector-based similarity |
| **Storage** | Qdrant `query_cache_public` |
| **Threshold** | 0.95 (Cosine similarity) |
| **Dimension** | 1024D (bge-m3) |
| **TTL** | 3600 seconds (1 hour) |
| **Strategy** | Public documents only |
| **Expected Hit Rate** | 15-30% |
| **Cache Hit Latency** | 20-50ms |
| **Control Flag** | `useCache: true` (default) |

**Cache Decision Tree:**
```
useCache = true?
    ├─ YES: Embed query → Search cache
    │       ├─ similarity >= 0.95 → CACHE HIT
    │       └─ similarity < 0.95 → CACHE MISS
    └─ NO: Skip cache
    
Cache HIT → Return contexts immediately (skip all retrieval)
Cache MISS → Continue to full workflow
```

---

## 5. Vector Search (Qdrant)

### Multi-Collection Strategy
```
Query Embedding (1024D, bge-m3:567m)
    ↓
Search in parallel:
├─ documents_children (100% topK)
│  └─ Child chunks (~512 tokens)
├─ documents_summaries (50% topK)  [×1.05 score boost]
│  └─ Document summaries
└─ documents_questions (50% topK)  [×1.1 score boost]
   └─ Generated Q&A
    ↓
Merge results:
├─ Deduplicate by parentChunkId
├─ Keep highest score
├─ Apply boosts
└─ Sort and return top K
```

### Hybrid Search
- **Dense:** Cosine similarity on 1024D embeddings
- **Sparse:** BM25-style (if queryText provided)
- **Combined:** Both for better coverage

### RBAC Filter
```
access_type = "public"              → Always included
access_type = "private"             → Only if owner
access_type = "shared"              → If in whitelist
document_id IN whitelistDocIds      → AND filter
```

---

## 6. Query Transformations

| Technique | Temperature | Max Tokens | Purpose |
|-----------|---|---|---|
| **Reformulation** | 0.7 | 200 | 3-5 query variations |
| **Rewrite** | 0.3 | 200 | Clarify intent |
| **HyDE** | 0.5 | 300 | Hypothetical answer |
| **Decomposition** | 0.4 | 300 | Complex → sub-queries |

**Execution:** All 4 in parallel + embeddings  
**Timeout:** 10 seconds per transformation  
**Retry:** 2 attempts + fallback provider  
**On Failure:** Continue without that transformation (non-critical)

---

## 7. Reranking (BGE-Reranker-v2-m3)

```
Fused Results (from RRF)
    ↓
Filter valid content
    ↓
Call TEI /rerank endpoint
├─ Input: { query, texts[] }
└─ Output: [{ index, score }]
    ↓
Score filtering
├─ Keep: rerankScore > RERANK_SCORE_THRESHOLD (default: 0.0)
└─ Filter out: ≤ 0.0 (irrelevant)
    ↓
Fallback logic
├─ If all filtered: Return top N ignoring threshold
└─ Fallback count: 3 (configurable)
    ↓
Sort by score + return top-K
```

**Score Interpretation:**
- Positive: Relevant (higher = better)
- Negative: Irrelevant/contradictory
- Range: -1.0 to 1.0 (NOT 0-1)

**Error Handling:**
- TEI timeout/failure → Use RRF scores as fallback
- Empty content → Skip result
- Service unavailable → Non-critical (continue with RRF)

---

## 8. Performance Targets & Current Status

| Metric | Target | Status | Notes |
|--------|--------|--------|-------|
| **P95 Latency** | <1500ms | ✅ Met | Cache hits <50ms |
| **Cache Hit Rate** | 15-30% | 📊 TBD | Depends on query distribution |
| **Success Rate** | >99% | ✅ High | Graceful fallbacks |
| **Cache Hit Latency** | 20-50ms | ✅ Met | Qdrant semantic search |
| **Full Retrieval** | 300-1500ms | ✅ Met | Multi-stage optimization |

---

## 9. Monitoring Dashboard Metrics

### Health Panel
```
Qdrant:     ✅ Connected  (latency: 45ms)
MySQL:      ✅ Connected  (query time: 23ms)
Reranker:   ✅ Ready      (latency: 78ms)
Auth:       ✅ Connected  (JWT latency: 12ms)
Datasource: ✅ Connected  (whitelist fetch: 34ms)
```

### Performance Panel
```
Requests/sec:       150
Avg P95 Latency:    1,234ms
Cache Hit Rate:     22.3%
Error Rate:         0.2%
```

### Cache Panel
```
Cache Hits:         3,456
Cache Misses:       12,123
Cache Size:         1,234 entries
Hit Latency:        31ms
Miss Latency:       1,289ms
```

### Quality Panel
```
Avg Sufficiency:    0.78
High Quality (>0.7): 68%
Rerank Fallback:    2.1% (TEI failures)
Retry Rate:         4.3% (insufficient results)
```

---

## 10. Configuration Quick Reference

### Essential Environment Variables
```bash
# Qdrant
QDRANT_URL=http://localhost:6333

# MySQL
DATABASE_URL=mysql://user:pass@localhost:3306/retrieval_db

# LLM (Query Transformation)
LLM_PROVIDER=ollama|openai|google|anthropic

# Cache
CACHE_ENABLED=true
CACHE_SIMILARITY_THRESHOLD=0.95
CACHE_TTL=3600

# Workflow
SUFFICIENCY_THRESHOLD=0.6           # 0-1
HIGH_QUALITY_THRESHOLD=0.7          # 0-1
MIN_CONTEXTS=3                      # Minimum results
MAX_RETRY_ITERATIONS=3              # Adaptive loop limit

# Reranking
RERANK_SCORE_THRESHOLD=0.0          # -1.0 to 1.0
RERANK_FALLBACK_COUNT=3             # If all filtered

# TEI Reranker
TEI_RERANKER_URL=http://localhost:8080
TEI_RERANKER_TIMEOUT=30000          # milliseconds
```

---

## 11. Error Handling Patterns

### Non-Critical (Continue Gracefully)
```
Cache lookup fails         → Continue to retrieval
HyDE generation fails      → Skip HyDE, use main query
Reformulation fails        → Skip variants, use main
Reranker unavailable       → Use RRF scores instead
MySQL enrichment fails     → Return without parent chunks
```

### Critical (Workflow Fails)
```
Qdrant connection fails    → Cannot retrieve
Query embedding fails      → Cannot proceed
Access filter fails        → Security issue
```

---

## 12. Request/Response Examples

### POST /query
```json
{
  "query": "What is the revenue of Q3 2024?",
  "mode": "retrieval_only",
  "topK": 10,
  "useCache": true
}
```

**Response (Success):**
```json
{
  "contexts": [
    {
      "parentChunkId": "chunk-123",
      "documentId": "doc-456",
      "content": "Q3 2024 Revenue Summary...",
      "tokens": 1823,
      "score": 0.89,
      "metadata": { "pageNumber": 5 },
      "sources": {
        "childChunks": [
          {
            "chunkId": "chunk-123-a",
            "content": "The Q3 revenue...",
            "score": 0.87
          }
        ]
      }
    }
  ],
  "metrics": {
    "totalDuration": 1234,
    "cacheHit": false,
    "qdrantResultCount": 45,
    "rerankedResultCount": 10,
    "parentChunkCount": 10,
    "iterations": 1,
    "sufficiencyScore": 0.82
  },
  "cached": false
}
```

**Response (Cache Hit):**
```json
{
  "contexts": [...],  // From cache
  "metrics": {
    "totalDuration": 31,
    "cacheHit": true,
    ...
  },
  "cached": true
}
```

---

## 13. Common Troubleshooting

| Issue | Symptoms | Check |
|-------|----------|-------|
| **Slow Queries** | P95 > 2s | Check Qdrant latency, TEI timeout |
| **Low Hit Rate** | <10% cache hits | Verify threshold, query distribution |
| **High Error Rate** | >1% failures | Check Qdrant/MySQL/TEI availability |
| **Poor Quality** | Low sufficiency scores | Adjust HIGH_QUALITY_THRESHOLD |
| **Frequent Retries** | High iteration count | Lower SUFFICIENCY_THRESHOLD |

---

## 14. File Structure

```
ltv-assistant-retrieval/
├── src/
│   ├── main.ts                 # Entry point + TCP setup
│   ├── app.module.ts           # Root module
│   │
│   ├── retrieval/
│   │   ├── retrieval.controller.ts      # HTTP /query endpoint
│   │   ├── retrieval-tcp.controller.ts  # TCP endpoints
│   │   │
│   │   ├── workflow/
│   │   │   ├── retrieval-workflow.service.ts  # LangGraph orchestration
│   │   │   ├── nodes/
│   │   │   │   ├── check-cache.node.ts
│   │   │   │   ├── analyze-query.node.ts
│   │   │   │   ├── build-access-filter.node.ts
│   │   │   │   ├── hybrid-retrieval.node.ts
│   │   │   │   ├── execute-sub-queries.node.ts
│   │   │   │   ├── fusion.node.ts
│   │   │   │   ├── rerank.node.ts
│   │   │   │   ├── enrich-small-to-big.node.ts
│   │   │   │   ├── check-sufficiency.node.ts
│   │   │   │   ├── select-mode.node.ts
│   │   │   │   └── update-cache.node.ts
│   │   │   └── state/
│   │   │       └── retrieval-state.ts   # State type definitions
│   │   │
│   │   ├── services/
│   │   │   ├── qdrant.service.ts            # Vector search
│   │   │   ├── qdrant-cache.service.ts      # Semantic cache
│   │   │   ├── mysql.service.ts             # Parent chunks
│   │   │   ├── reranker.service.ts          # Cross-encoder
│   │   │   ├── query-transformation.service.ts  # LLM transforms
│   │   │   ├── sparse-embedding.service.ts  # BM25 vectors
│   │   │   └── cache-invalidation.service.ts
│   │   │
│   │   ├── providers/
│   │   │   ├── embedding-provider.factory.ts
│   │   │   ├── llm-provider.factory.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── clients/
│   │   │   └── datasource.client.ts   # TCP client for datasource
│   │   │
│   │   ├── dto/
│   │   │   ├── query-request.dto.ts
│   │   │   └── retrieval-result.dto.ts
│   │   │
│   │   ├── types/
│   │   │   ├── index.ts              # Core types
│   │   │   └── cache.types.ts
│   │   │
│   │   └── retrieval.module.ts
│   │
│   ├── database/
│   │   ├── schema.ts           # MySQL schema (read-only)
│   │   └── database.module.ts  # Drizzle ORM setup
│   │
│   ├── shared/
│   │   ├── logging/
│   │   │   └── pino.config.ts  # Structured logging
│   │   ├── tracing/
│   │   │   └── tracer.ts       # OpenTelemetry setup
│   │   └── middleware/
│   │       └── request-id.middleware.ts
│   │
│   ├── common/
│   │   ├── guards/
│   │   │   ├── gateway-auth.guard.ts
│   │   │   └── roles.guard.ts
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   └── roles.decorator.ts
│   │   ├── interfaces/
│   │   │   └── request.interface.ts
│   │   ├── constants/
│   │   │   └── roles.constant.ts
│   │   └── common.module.ts
│   │
│   └── cache/
│       └── cache.module.ts
│
├── docs/
│   ├── retrieval-service-analysis.md  ← Comprehensive analysis
│   ├── retrieval-prd.md               ← Product requirements
│   ├── retrieval-implement-plan.md    ← Implementation roadmap
│   └── semantic-cache-design.md       ← Cache architecture
│
└── monitoring/
    └── dashboards/
        └── ltv-assistant-retrieval-dashboard.json  ← Grafana dashboard
```

---

## 15. Key Metrics to Monitor (Super Admin Dashboard)

**Real-time KPIs:**
- Service availability (%) - Target: 99.5%+
- P95 latency (ms) - Target: <1500ms
- Cache hit rate (%) - Target: 15-30%
- Error rate (%) - Target: <0.5%

**Trends:**
- Query volume per hour
- Active users by role
- Cache size growth
- Reranker accuracy

**Alerts:**
- Latency > 2000ms
- Error rate > 1%
- Qdrant unavailable
- Cache size > threshold
- Reranker timeout rate > 5%

---

## 16. Dependencies Summary

```
┌─ Qdrant (Vector DB) ─── Vector search + semantic cache
├─ MySQL              ─── Parent/child chunk storage
├─ TEI (Reranker)     ─── Cross-encoder reranking (optional)
├─ Auth Service       ─── JWT validation (TCP)
├─ Datasource Service ─── Document metadata + RBAC (TCP)
│
└─ LangChain/LangGraph
  ├─ Embedding models
  ├─ LLM providers (OpenAI, Google, Anthropic, Ollama)
  └─ Output parsers

Observability:
├─ OpenTelemetry (Jaeger/Tempo)
├─ Pino logging
└─ Grafana dashboards
```

---

**For detailed analysis, see:** `/docs/retrieval-service-analysis.md`

