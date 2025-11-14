# Query Decomposition Execution - Implementation Guide

> **Status**: ✅ Completed (November 2025)
> **Feature Type**: Hybrid Fallback Strategy for Complex Query Handling
> **Impact**: Improved recall for insufficient retrieval results

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Implementation Details](#implementation-details)
4. [Configuration](#configuration)
5. [Usage Examples](#usage-examples)
6. [Monitoring & Metrics](#monitoring--metrics)

---

## Overview

### What is Query Decomposition Execution?

Query Decomposition Execution is a **hybrid fallback strategy** that improves retrieval quality when the main query returns insufficient results. Instead of simply failing or returning poor results, the system:

1. **Decomposes** complex queries into 2-4 simpler sub-queries
2. **Executes** these sub-queries in parallel when main results are insufficient
3. **Merges** sub-query results with main results using RRF (Reciprocal Rank Fusion)
4. **Continues** the pipeline with enriched results

### When Does It Trigger?

The decomposition execution triggers when **ALL** of the following conditions are met:

1. ❌ Main query results are **insufficient** (sufficiency score < threshold)
2. ⏱️ Adaptive retry loop has **exhausted all iterations** (reached MAX_RETRY_ITERATIONS)
3. 🔄 Decomposition has **not been triggered yet** (prevents duplicate execution)
4. 📝 Decomposed queries **exist** from query analysis phase

### Key Benefits

- ✅ **Improved Recall**: Sub-queries capture different aspects of complex queries
- ✅ **Fallback Safety**: Only triggers when main query fails after retries
- ✅ **Parallel Execution**: All sub-queries execute simultaneously for speed
- ✅ **Intelligent Merging**: RRF algorithm combines results optimally
- ✅ **Production Ready**: Comprehensive error handling and metrics

---

## Architecture

### High-Level Flow

```
Main Query → Insufficient Results → Retry 3x → Still Insufficient → Execute Sub-Queries
                                                                    ↓
                                    RRF Fusion ← Sub-Query Results ←
```

### State Machine Integration

The feature integrates into the LangGraph retrieval workflow through:

1. **RetrievalState Extension**: Added `subQueryResults`, `decompositionTriggered`, `subQueryMetrics`
2. **New Node**: `executeSubQueries` node for parallel execution
3. **Conditional Routing**: Modified `checkSufficiency` routing to include decomposition path
4. **Fusion Integration**: Updated `fusion` node to process sub-query results

See [diagrams.md](./diagrams.md#2-query-decomposition-execution-detailed-flow) for visual representation.

---

## Implementation Details

### Phase 1: Query Transformation Service Refactoring

**Location**: `src/retrieval/services/query-transformation.service.ts`

**Key Changes**:

1. **Configuration System**: Full `.env` support for all transformation methods
   - Provider-specific overrides (`QUERY_DECOMPOSITION_PROVIDER`)
   - Retry logic (`QUERY_DECOMPOSITION_MAX_RETRIES`)
   - Timeout controls (`QUERY_DECOMPOSITION_TIMEOUT`)
   - Fallback providers (`QUERY_DECOMPOSITION_FALLBACK_PROVIDER`)

2. **Type Safety**: Proper TypeScript patterns
   - Type guard: `isLLMProvider(value): value is LLMProvider`
   - No `any` types, no `as` casting
   - Strong typing throughout

3. **Retry & Fallback**: Enterprise-grade error handling
   - Configurable retries with exponential backoff
   - Timeout using `Promise.race`
   - Automatic fallback to secondary provider

**Code Pattern**:
```typescript
// Type guard for LLM provider validation
private isLLMProvider(value: string): value is LLMProvider {
  return ['openai', 'google', 'anthropic', 'ollama'].includes(value);
}

// Configuration helper
private getTransformationConfig(
  transformationType: 'DECOMPOSITION'
): TransformationConfig {
  const prefix = `QUERY_${transformationType}`;
  const providerValue = this.configService.get<string>(`${prefix}_PROVIDER`) || 'ollama';

  return {
    provider: this.validateLLMProvider(providerValue),
    model: this.configService.get(`${prefix}_MODEL`) || 'gemma3:1b',
    maxRetries: parseInt(this.configService.get(`${prefix}_MAX_RETRIES`) || '2'),
    timeout: parseInt(this.configService.get(`${prefix}_TIMEOUT`) || '10000'),
    fallbackEnabled: this.configService.get(`${prefix}_FALLBACK_ENABLED`) === 'true',
    // ... other fields
  };
}
```

### Phase 2: Execute Sub-Queries Node

**Location**: `src/retrieval/workflow/nodes/execute-sub-queries.node.ts`

**Implementation Steps**:

1. **Parallel Embedding Generation**
   ```typescript
   const subQueryEmbeddings = await Promise.all(
     state.decomposedQueries.map((sq) => embeddings.embedQuery(sq))
   );
   ```

2. **Smart Limit Distribution**
   ```typescript
   const limitPerSubQuery = Math.max(
     3, // Minimum 3 results per sub-query
     Math.floor(state.topK / state.decomposedQueries.length)
   );
   ```

3. **Parallel Hybrid Search**
   ```typescript
   const subQueryResults = await Promise.all(
     subQueryEmbeddings.map((embedding, idx) =>
       qdrantService.search(
         embedding,
         state.accessFilter?.qdrantFilter,
         limitPerSubQuery,
         state.decomposedQueries[idx] // For sparse search
       )
     )
   );
   ```

4. **Deduplication by ChunkId**
   ```typescript
   const deduplicatedMap = new Map<string, QdrantResult>();
   allResults.forEach((result) => {
     const existing = deduplicatedMap.get(result.chunkId);
     if (!existing || result.score > existing.score) {
       deduplicatedMap.set(result.chunkId, result);
     }
   });
   ```

### Phase 3: Fusion Node Update

**Location**: `src/retrieval/workflow/nodes/fusion.node.ts`

**Integration**:
```typescript
// Process sub-query results in RRF algorithm
if (state.subQueryResults && state.subQueryResults.length > 0) {
  state.subQueryResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (RRF_K + rank);

    const existing = chunkScores.get(result.chunkId);
    if (existing) {
      existing.rrfScore += rrfScore; // Add to existing score
      existing.sources.push('subquery');
      existing.originalScores.subquery = result.score;
    } else {
      chunkScores.set(result.chunkId, {
        chunk: result,
        rrfScore,
        sources: ['subquery'],
        originalScores: { subquery: result.score },
      });
    }
  });
}
```

### Phase 4: Sufficiency Check Update

**Location**: `src/retrieval/workflow/nodes/check-sufficiency.node.ts`

**Decomposition Trigger Logic**:
```typescript
const shouldTriggerDecomposition =
  !isSufficient &&                              // Results insufficient
  !hasRetriesLeft &&                            // No more retries
  !state.decompositionTriggered &&              // Not triggered yet
  state.decomposedQueries &&                    // Has decomposed queries
  state.decomposedQueries.length > 0;

return {
  sufficiencyScore,
  shouldRetry: shouldTriggerDecomposition ? false : shouldRetry,
  decompositionTriggered: shouldTriggerDecomposition ? true : state.decompositionTriggered,
};
```

### Phase 5: Workflow Service Integration

**Location**: `src/retrieval/workflow/retrieval-workflow.service.ts`

**Node Registration**:
```typescript
.addNode(
  'executeSubQueries',
  createExecuteSubQueriesNode(this.embeddingFactory, this.qdrantService),
)
```

**Conditional Routing**:
```typescript
.addConditionalEdges(
  'checkSufficiency',
  (state: RetrievalStateType) => {
    if (
      state.decompositionTriggered &&
      state.decomposedQueries &&
      state.decomposedQueries.length > 0 &&
      (!state.subQueryResults || state.subQueryResults.length === 0)
    ) {
      return 'decomposition';
    }
    return state.shouldRetry ? 'retry' : 'continue';
  },
  {
    decomposition: 'executeSubQueries',
    retry: 'analyzeQuery',
    continue: 'selectMode',
  },
)
.addEdge('executeSubQueries', 'fusion') // Merge with main results
```

---

## Configuration

### Environment Variables

#### Query Decomposition Settings

```env
# Provider Configuration (Default: Google with Ollama fallback)
QUERY_DECOMPOSITION_PROVIDER=google
QUERY_DECOMPOSITION_MODEL=gemini-1.5-flash
QUERY_DECOMPOSITION_TEMPERATURE=0.7
QUERY_DECOMPOSITION_MAX_TOKENS=200

# Retry & Timeout
QUERY_DECOMPOSITION_MAX_RETRIES=2
QUERY_DECOMPOSITION_TIMEOUT=10000  # 10 seconds

# Fallback Configuration
QUERY_DECOMPOSITION_FALLBACK_ENABLED=true
QUERY_DECOMPOSITION_FALLBACK_PROVIDER=ollama
QUERY_DECOMPOSITION_FALLBACK_MODEL=gemma3:1b
```

#### Other Transformation Methods

Apply the same pattern for:
- `QUERY_REFORMULATION_*`
- `QUERY_REWRITE_*`
- `QUERY_HYDE_*`

#### Sufficiency Thresholds

```env
# Adaptive Loop Configuration
MAX_RETRY_ITERATIONS=3
SUFFICIENCY_THRESHOLD=0.6
HIGH_QUALITY_THRESHOLD=0.7
MIN_CONTEXTS=3
```

### Configuration Hierarchy

1. **Specific Override** (highest priority): `QUERY_DECOMPOSITION_PROVIDER`
2. **General LLM Setting**: `LLM_PROVIDER`
3. **Default Fallback** (lowest priority): `'ollama'`

---

## Usage Examples

### Example 1: Simple Query (No Decomposition Triggered)

```typescript
// Request
{
  query: "What is RAG?",
  topK: 10
}

// Flow:
// 1. Main query retrieval → Returns 8 high-quality results
// 2. Sufficiency check → Score: 0.75 (SUFFICIENT)
// 3. Result: Returns main results only, no decomposition

// Metrics:
{
  qdrantResultCount: 8,
  fusedResultCount: 8,
  sufficiencyScore: 0.75,
  decompositionTriggered: false
}
```

### Example 2: Complex Query (Decomposition Triggered)

```typescript
// Request
{
  query: "Explain the differences between semantic search, vector databases, and traditional keyword search in the context of modern RAG architectures",
  topK: 10
}

// Flow:
// 1. Query Analysis → Generates 3 decomposed queries:
//    - "What is semantic search and how does it work?"
//    - "Vector database comparison with traditional databases"
//    - "RAG architecture keyword search limitations"
// 2. Main query retrieval → Returns 4 results
// 3. Sufficiency check → Score: 0.4 (INSUFFICIENT)
// 4. Retry 1 → Still insufficient (score: 0.45)
// 5. Retry 2 → Still insufficient (score: 0.42)
// 6. Retry 3 → Still insufficient (score: 0.43)
// 7. Decomposition triggered → Execute 3 sub-queries in parallel
// 8. Sub-query results: [5, 6, 4] → Total 15 results
// 9. Deduplication → 12 unique chunks
// 10. RRF fusion → Merge with main results → 14 total
// 11. Rerank + enrich → Final 10 contexts

// Metrics:
{
  qdrantResultCount: 4,
  subQueryMetrics: {
    subQueriesExecuted: 3,
    subQueryResultCount: 15,
    subQueryDuration: 1243,
    aggregatedResultCount: 12,
    decompositionReason: 'insufficient'
  },
  fusedResultCount: 14,
  rerankedResultCount: 10,
  sufficiencyScore: 0.43,
  decompositionTriggered: true
}
```

### Example 3: Configuration Testing

```typescript
// Test different providers
const testConfig = {
  QUERY_DECOMPOSITION_PROVIDER: 'google',
  QUERY_DECOMPOSITION_MODEL: 'gemini-1.5-flash',
  QUERY_DECOMPOSITION_MAX_RETRIES: 3,
  QUERY_DECOMPOSITION_TIMEOUT: 15000,
  QUERY_DECOMPOSITION_FALLBACK_ENABLED: true,
  QUERY_DECOMPOSITION_FALLBACK_PROVIDER: 'ollama',
  QUERY_DECOMPOSITION_FALLBACK_MODEL: 'gemma3:1b'
};

// Scenario 1: Google succeeds
// → Uses gemini-1.5-flash

// Scenario 2: Google fails (timeout after 15s)
// → Retries 3 times with exponential backoff (1s, 2s, 4s)
// → Falls back to ollama gemma3:1b
```

---

## Monitoring & Metrics

### Metrics Collected

The system tracks comprehensive metrics in the `subQueryMetrics` field:

```typescript
subQueryMetrics: {
  subQueriesExecuted: number;      // How many sub-queries were executed
  subQueryResultCount: number;     // Total results from all sub-queries (before dedup)
  subQueryDuration: number;        // Time taken for parallel execution (ms)
  aggregatedResultCount: number;   // Unique results after deduplication
  decompositionReason: 'insufficient' | 'complex_query' | 'none';
}
```

### Logging & Observability

#### Key Log Messages

```typescript
// Decomposition triggered
logger.log('Executing 3 sub-queries in parallel');

// Per sub-query results
logger.debug('Sub-query 1 "What is semantic search?": 5 results');
logger.debug('Sub-query 2 "Vector database comparison": 6 results');
logger.debug('Sub-query 3 "RAG keyword search": 4 results');

// Aggregation summary
logger.log('Sub-queries completed in 1243ms: 15 total → 12 unique results');
```

#### Fusion Node Integration

```typescript
logger.log('Starting RRF fusion: 26 total results (qdrant=4, mysql=10, subquery=12)');
logger.log('Processing 12 sub-query results in RRF');
logger.log('RRF fusion completed in 45ms: 26 → 14 results (buffer=15)');
```

### Grafana Dashboard Queries

#### Sub-Query Execution Rate

```promql
rate(retrieval_subquery_executed_total[5m])
```

#### Average Sub-Query Duration

```promql
rate(retrieval_subquery_duration_sum[5m]) / rate(retrieval_subquery_duration_count[5m])
```

#### Decomposition Trigger Ratio

```promql
rate(retrieval_decomposition_triggered_total[5m]) / rate(retrieval_requests_total[5m])
```

---

## Troubleshooting

### Issue 1: Decomposition Never Triggers

**Symptoms**: `decompositionTriggered: false` in all requests

**Possible Causes**:
1. ✅ Main query always returns sufficient results
2. ❌ `MAX_RETRY_ITERATIONS` set too high (never reaches decomposition)
3. ❌ `SUFFICIENCY_THRESHOLD` set too low (always marks as sufficient)
4. ❌ Query decomposition disabled or failing silently

**Solutions**:
```env
# Lower sufficiency threshold
SUFFICIENCY_THRESHOLD=0.6

# Reduce max retries to reach decomposition faster
MAX_RETRY_ITERATIONS=2

# Enable debug logging
LOG_LEVEL=debug
```

### Issue 2: Sub-Queries Return Poor Results

**Symptoms**: `subQueryResultCount: 0` or very low quality results

**Possible Causes**:
1. ❌ Decomposition generates poor sub-queries
2. ❌ LLM provider issues (timeout/rate limit)
3. ❌ Vector embeddings not capturing sub-query semantics

**Solutions**:
```env
# Switch to better decomposition model
QUERY_DECOMPOSITION_PROVIDER=google
QUERY_DECOMPOSITION_MODEL=gemini-1.5-pro  # More capable

# Increase timeout
QUERY_DECOMPOSITION_TIMEOUT=20000

# Enable fallback
QUERY_DECOMPOSITION_FALLBACK_ENABLED=true
```

### Issue 3: Slow Performance

**Symptoms**: `subQueryDuration > 2000ms`

**Possible Causes**:
1. ❌ Too many sub-queries generated (>4)
2. ❌ Qdrant query latency high
3. ❌ Embedding generation slow

**Solutions**:
```typescript
// Limit decomposed queries in decomposeQuery()
const subQueries = result
  .split('\n')
  .filter(line => line.length > 0)
  .slice(0, 3); // Max 3 instead of 4
```

---

## Best Practices

### 1. Configuration

✅ **DO**:
- Use Google Gemini for primary decomposition (fast + capable)
- Set Ollama as fallback for resilience
- Keep MAX_RETRIES at 2-3 (balance quality vs latency)
- Set timeout to 10-15s (prevent hanging)

❌ **DON'T**:
- Use slow models for decomposition (adds latency)
- Disable fallback in production
- Set MAX_RETRIES too high (delays decomposition trigger)

### 2. Query Design

✅ **DO**:
- Test with complex, multi-aspect queries
- Verify decomposition generates meaningful sub-queries
- Monitor sub-query result quality

❌ **DON'T**:
- Rely on decomposition for simple queries
- Generate more than 4 sub-queries (diminishing returns)

### 3. Monitoring

✅ **DO**:
- Track decomposition trigger rate (alert if too high/low)
- Monitor sub-query duration (alert if >2s)
- Log sub-query quality for analysis

❌ **DON'T**:
- Ignore decomposition metrics
- Skip logging sub-query content (needed for debugging)

---

## Future Enhancements

### Potential Improvements

1. **Adaptive Sub-Query Count**: Dynamically adjust based on query complexity
2. **Query Quality Scoring**: Pre-filter poor decomposed queries
3. **Caching Sub-Query Results**: Cache common sub-query patterns
4. **Personalized Decomposition**: User-specific decomposition strategies
5. **A/B Testing Framework**: Compare decomposition strategies

---

## References

- [LangChain Query Decomposition](https://python.langchain.com/docs/how_to/MultiQueryRetriever)
- [Reciprocal Rank Fusion Paper](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
- [Hybrid Search Best Practices](https://qdrant.tech/articles/hybrid-search/)

---

**Last Updated**: November 2025
**Maintainer**: LTV Assistant Team
