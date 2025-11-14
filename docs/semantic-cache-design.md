# Semantic Cache Design - LTV Assistant Retrieval Service

**Version:** 1.0
**Created:** 2025-11-09
**Status:** Implementation Guide
**Reference:** [retrieval-prd.md](./plans/retrieval-prd.md), [retrieval-implement-plan.md](./plans/retrieval-implement-plan.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Decision](#architecture-decision)
3. [Qdrant Collection Design](#qdrant-collection-design)
4. [RBAC Strategy (Public-Only)](#rbac-strategy-public-only)
5. [Workflow Integration](#workflow-integration)
6. [Implementation Examples](#implementation-examples)
7. [Cache Invalidation](#cache-invalidation)
8. [Performance Considerations](#performance-considerations)
9. [Testing Strategy](#testing-strategy)
10. [Monitoring & Metrics](#monitoring--metrics)

---

## Overview

### Purpose

Implement semantic caching layer for LTV Assistant Retrieval Service to:
- ✅ Reduce retrieval latency for similar queries
- ✅ Decrease load on vector search (Qdrant), reranking (TEI), and MySQL
- ✅ Improve user experience with faster response times
- ✅ Maximize cache sharing across all users (public documents only)

### Key Principles

1. **Public Documents Only** - Cache chỉ khi TẤT CẢ contexts đều là public documents
2. **Semantic Matching** - Sử dụng vector similarity thay vì exact match
3. **Conservative Threshold** - Similarity threshold 0.95 để đảm bảo độ chính xác
4. **User Control** - Frontend có thể disable cache với `useCache: false` flag
5. **Non-Critical** - Cache errors không được fail retrieval workflow

---

## Architecture Decision

### Why Qdrant Instead of Redis?

| Aspect | Qdrant (Chosen) | Redis (Rejected) |
|--------|-----------------|------------------|
| **Matching** | Semantic similarity search | Exact query string match |
| **Flexibility** | "How to use RAG" matches "RAG usage guide" | No match unless exact |
| **Stack Consistency** | Same as indexing & retrieval | Additional dependency |
| **Invalidation** | Payload filtering by documentIds | Complex key pattern matching |
| **Performance** | 20-50ms semantic search | 1-5ms exact lookup |
| **Hit Rate** | Higher (semantic matches) | Lower (exact only) |

**Decision:** Qdrant wins due to semantic matching capability, which provides better user experience and higher hit rates.

### Single-Tier vs Two-Tier Caching

**Evaluated:** Redis L1 (exact) + Qdrant L2 (semantic)

**Decision:** Single-tier Qdrant only
- Simpler architecture
- 20-50ms latency is acceptable for retrieval queries (target: < 2s total)
- Avoid complexity of cache coordination
- Semantic matching provides better ROI than exact matching

---

## Qdrant Collection Design

### Collection Configuration

```typescript
const CACHE_COLLECTION = 'query_cache_public';

await qdrantClient.createCollection(CACHE_COLLECTION, {
  vectors: {
    // Dense vector for semantic matching
    dense: {
      size: 1024,          // bge-m3 embeddings (same as indexing)
      distance: 'Cosine',  // Cosine similarity for semantic search
    },
  },

  // No sparse vectors needed for caching

  // Optimization settings
  optimizers_config: {
    memmap_threshold: 20000,  // Memory-mapped storage for large cache
  },

  // Keep payload in memory for fast filtering
  on_disk_payload: false,
});
```

### Payload Schema

```typescript
interface PublicCacheEntry {
  // ===== Cache Identification =====
  cacheId: string;           // UUID (random)
  queryText: string;         // Original query string (for debugging & logging)

  // ===== Cached Data =====
  contexts: Context[];       // Full retrieval results (all public documents)

  // ===== Invalidation Tracking =====
  documentIds: string[];     // Unique document IDs in contexts (for invalidation)

  // ===== Metrics & TTL =====
  timestamp: number;         // Unix timestamp (milliseconds) when cached
  ttl: number;               // Time-to-live in seconds (default: 3600)
  hits: number;              // Cache hit counter (incremented on each hit)
  lastAccess: number;        // Last access timestamp (for monitoring)
}
```

### Payload Indexes

Create indexes for efficient filtering:

```typescript
// Index 1: documentIds (keyword) - for invalidation
await qdrantClient.createPayloadIndex(CACHE_COLLECTION, {
  field_name: 'documentIds',
  field_schema: 'keyword',
});

// Index 2: timestamp (integer) - for TTL cleanup
await qdrantClient.createPayloadIndex(CACHE_COLLECTION, {
  field_name: 'timestamp',
  field_schema: 'integer',
});
```

---

## RBAC Strategy (Public-Only)

### Why Public-Only?

**Security First Approach:**
- ❌ No risk of permission leaks
- ❌ No need for complex RBAC filters on cache
- ❌ No need to re-validate contexts on cache hit
- ✅ Maximum cache sharing across all users
- ✅ Simple implementation
- ✅ Easy to reason about

### Cache Decision Logic

```typescript
function shouldCache(contexts: Context[]): boolean {
  // Rule: ALL contexts must be public documents
  const allPublic = contexts.every(
    ctx => ctx.metadata.documentType === 'public'
  );

  return allPublic;
}
```

**Examples:**

| Scenario | Contexts | Cache? | Reason |
|----------|----------|--------|--------|
| Query 1 | [public, public, public] | ✅ Yes | All public |
| Query 2 | [public, private, public] | ❌ No | Mixed |
| Query 3 | [private, private] | ❌ No | All private |
| Query 4 | [public] | ✅ Yes | Single public |

### Access Control

**No RBAC filtering needed on cache lookup:**
- Cache only contains public documents
- All users (SUPER_ADMIN, ADMIN, USER) can access public documents
- No need to check userId or role on cache hit

**Simplified flow:**
1. User sends query
2. Embed query → Semantic search in cache
3. If hit and TTL valid → Return cached contexts immediately
4. No RBAC re-validation needed ✅

---

## Workflow Integration

### LangGraph Workflow Changes

**State Updates:**

```typescript
export const RetrievalState = Annotation.Root({
  // ... existing fields ...

  // Cache control (from CMS request)
  useCache: Annotation<boolean>,        // Enable/disable cache

  // Cache results
  cacheHit: Annotation<boolean>,        // True if cache hit
  cacheLatency: Annotation<number | null>,  // Cache lookup time
});
```

**Workflow Graph:**

```typescript
const workflow = new StateGraph(RetrievalState)
  // Add cache nodes
  .addNode('checkCache', createCheckCacheNode(...))
  .addNode('analyzeQuery', analyzeQuery)
  .addNode('buildAccessFilter', buildAccessFilter)
  // ... other retrieval nodes ...
  .addNode('selectMode', selectMode)
  .addNode('updateCache', createUpdateCacheNode(...))

  // Edges
  .addEdge(START, 'checkCache')

  // Conditional: cache hit skips entire retrieval
  .addConditionalEdges(
    'checkCache',
    (state) => state.cacheHit ? 'cache_hit' : 'cache_miss',
    {
      'cache_hit': END,         // Return cached results immediately
      'cache_miss': 'analyzeQuery',  // Continue normal retrieval flow
    }
  )

  // Normal retrieval flow
  .addEdge('analyzeQuery', 'buildAccessFilter')
  // ... all retrieval nodes ...
  .addEdge('selectMode', 'updateCache')
  .addEdge('updateCache', END);
```

**Flow Diagram:**

```
┌─────────────┐
│    START    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  checkCache     │ ← Semantic search in Qdrant
└────────┬────────┘
         │
         ├─── Cache HIT (similarity ≥ 0.95) ──→ END (return cached contexts)
         │
         └─── Cache MISS ──┐
                           │
                           ▼
                    ┌──────────────┐
                    │ analyzeQuery │
                    └──────┬───────┘
                           │
                           ▼
                    (normal retrieval flow)
                           │
                           ▼
                    ┌──────────────┐
                    │  selectMode  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ updateCache  │ ← Store in Qdrant (if all public)
                    └──────┬───────┘
                           │
                           ▼
                         END
```

---

## Implementation Examples

### Example 1: QdrantCacheService

```typescript
import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_CLIENT } from '../constants';
import type { Context } from '../types';
import * as crypto from 'crypto';

interface PublicCacheEntry {
  cacheId: string;
  queryText: string;
  contexts: Context[];
  documentIds: string[];
  timestamp: number;
  ttl: number;
  hits: number;
  lastAccess: number;
}

@Injectable()
export class QdrantCacheService implements OnModuleInit {
  private readonly logger = new Logger(QdrantCacheService.name);

  private readonly CACHE_COLLECTION = 'query_cache_public';
  private readonly SIMILARITY_THRESHOLD = 0.95;  // Conservative
  private readonly DEFAULT_TTL = 3600;  // 1 hour

  constructor(
    @Inject(QDRANT_CLIENT) private readonly qdrantClient: QdrantClient,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureCacheCollectionExists();
  }

  /**
   * Ensure cache collection exists (same pattern as indexing service)
   */
  private async ensureCacheCollectionExists(): Promise<void> {
    try {
      await this.qdrantClient.getCollection(this.CACHE_COLLECTION);
      this.logger.log(`Cache collection "${this.CACHE_COLLECTION}" exists`);
    } catch {
      this.logger.log(`Creating cache collection "${this.CACHE_COLLECTION}"...`);

      await this.qdrantClient.createCollection(this.CACHE_COLLECTION, {
        vectors: {
          dense: {
            size: 1024,  // bge-m3
            distance: 'Cosine',
          },
        },
        optimizers_config: {
          memmap_threshold: 20000,
        },
        on_disk_payload: false,
      });

      // Create payload indexes
      await this.createPayloadIndexes();
    }
  }

  private async createPayloadIndexes(): Promise<void> {
    try {
      await this.qdrantClient.createPayloadIndex(this.CACHE_COLLECTION, {
        field_name: 'documentIds',
        field_schema: 'keyword',
      });

      await this.qdrantClient.createPayloadIndex(this.CACHE_COLLECTION, {
        field_name: 'timestamp',
        field_schema: 'integer',
      });

      this.logger.log('Created cache payload indexes');
    } catch (error) {
      this.logger.warn(`Could not create cache indexes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Search for cached query (semantic matching)
   */
  async searchCache(
    queryEmbedding: number[],
    useCache: boolean,
  ): Promise<PublicCacheEntry | null> {
    if (!useCache) return null;

    try {
      const results = await this.qdrantClient.search(this.CACHE_COLLECTION, {
        vector: queryEmbedding,
        limit: 1,
        score_threshold: this.SIMILARITY_THRESHOLD,
        with_payload: true,
      });

      if (results.length === 0) return null;

      const cacheEntry = results[0].payload as unknown as PublicCacheEntry;

      // Check TTL
      const age = Date.now() - cacheEntry.timestamp;
      if (age > cacheEntry.ttl * 1000) {
        // Expired, delete it
        await this.qdrantClient.delete(this.CACHE_COLLECTION, {
          points: [results[0].id],
        });
        return null;
      }

      // Update hit counter (background, non-blocking)
      this.incrementHitCounter(results[0].id, cacheEntry).catch(err => {
        this.logger.warn('Failed to increment hit counter', { error: err });
      });

      this.logger.log('Cache HIT', {
        similarity: results[0].score,
        age,
        hits: cacheEntry.hits + 1,
      });

      return cacheEntry;
    } catch (error) {
      this.logger.warn('Cache search failed', { error });
      return null;  // Fallback to normal retrieval
    }
  }

  /**
   * Store query results in cache (public-only)
   */
  async storeCache(
    queryEmbedding: number[],
    queryText: string,
    contexts: Context[],
    useCache: boolean,
  ): Promise<void> {
    if (!useCache) return;

    // Safety check: Only cache if ALL contexts are public
    const allPublic = contexts.every(
      ctx => ctx.metadata.documentType === 'public'
    );

    if (!allPublic) {
      this.logger.log('Skipping cache: contains non-public documents');
      return;
    }

    try {
      const cacheEntry: PublicCacheEntry = {
        cacheId: crypto.randomUUID(),
        queryText,
        contexts,
        documentIds: [...new Set(contexts.map(c => c.documentId))],
        timestamp: Date.now(),
        ttl: this.DEFAULT_TTL,
        hits: 0,
        lastAccess: Date.now(),
      };

      await this.qdrantClient.upsert(this.CACHE_COLLECTION, {
        points: [{
          id: this.stringToUuid(cacheEntry.cacheId),
          vector: queryEmbedding,
          payload: cacheEntry as unknown as Record<string, unknown>,
        }],
        wait: true,
      });

      this.logger.log('Cache stored', {
        queryText,
        contextCount: contexts.length,
        documentIds: cacheEntry.documentIds,
      });
    } catch (error) {
      this.logger.warn('Cache store failed', { error });
      // Non-critical: don't throw
    }
  }

  /**
   * Invalidate cache entries containing specific document
   */
  async invalidateByDocument(documentId: string): Promise<void> {
    try {
      await this.qdrantClient.delete(this.CACHE_COLLECTION, {
        filter: {
          must: [{
            key: 'documentIds',
            match: { any: [documentId] },
          }],
        },
      });

      this.logger.log(`Invalidated cache for document ${documentId}`);
    } catch (error) {
      this.logger.error('Cache invalidation failed', { error });
    }
  }

  /**
   * Cleanup expired entries (cron job)
   */
  async cleanupExpired(): Promise<void> {
    try {
      const now = Date.now();
      const cutoff = now - (this.DEFAULT_TTL * 1000);

      await this.qdrantClient.delete(this.CACHE_COLLECTION, {
        filter: {
          must: [{
            key: 'timestamp',
            range: { lt: cutoff },
          }],
        },
      });

      this.logger.log('Cleaned up expired cache entries');
    } catch (error) {
      this.logger.error('Cache cleanup failed', { error });
    }
  }

  private async incrementHitCounter(
    pointId: string | number,
    cacheEntry: PublicCacheEntry,
  ): Promise<void> {
    await this.qdrantClient.setPayload(this.CACHE_COLLECTION, {
      points: [pointId],
      payload: {
        hits: cacheEntry.hits + 1,
        lastAccess: Date.now(),
      },
    });
  }

  private stringToUuid(str: string): string {
    const hash = crypto.createHash('md5').update(str).digest('hex');
    return `${hash.substr(0, 8)}-${hash.substr(8, 4)}-4${hash.substr(13, 3)}-${((parseInt(hash.substr(16, 2), 16) & 0x3f) | 0x80).toString(16)}${hash.substr(18, 2)}-${hash.substr(20, 12)}`;
  }
}
```

### Example 2: Check Cache Node

```typescript
import type { Embeddings } from '@langchain/core/embeddings';
import type { RetrievalStateType } from '../state/retrieval-state';
import type { QdrantCacheService } from '../../services/qdrant-cache.service';
import type { EmbeddingProviderFactory } from '../../providers/embedding-provider.factory';

export function createCheckCacheNode(
  qdrantCacheService: QdrantCacheService,
  embeddingFactory: EmbeddingProviderFactory,
) {
  return async (
    state: RetrievalStateType
  ): Promise<Partial<RetrievalStateType>> => {
    const startTime = Date.now();

    // Early exit if cache disabled
    if (!state.useCache) {
      return {
        cacheHit: false,
        currentStage: 'check_cache_skipped',
      };
    }

    try {
      // Embed query for semantic search
      const embeddings: Embeddings = embeddingFactory.createEmbeddingModel();
      const queryEmbedding = await embeddings.embedQuery(state.query);

      // Search semantic cache
      const cacheEntry = await qdrantCacheService.searchCache(
        queryEmbedding,
        state.useCache,
      );

      if (cacheEntry) {
        // Cache HIT - return cached contexts immediately
        const cacheLatency = Date.now() - startTime;

        return {
          finalContexts: cacheEntry.contexts,
          cacheHit: true,
          cacheLatency,
          currentStage: 'cache_hit',
          metrics: {
            ...state.metrics,
            cacheHit: true,
            totalDuration: cacheLatency,
          },
        };
      }

      // Cache MISS - continue to normal retrieval
      return {
        queryEmbedding,  // Reuse embedding for retrieval
        cacheHit: false,
        currentStage: 'cache_miss',
      };
    } catch (error) {
      // Non-critical: fallback to normal retrieval
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Cache lookup failed, continuing without cache', { error: errorMessage });

      return {
        cacheHit: false,
        currentStage: 'cache_error',
      };
    }
  };
}
```

### Example 3: Update Cache Node

```typescript
export function createUpdateCacheNode(
  qdrantCacheService: QdrantCacheService,
) {
  return async (
    state: RetrievalStateType
  ): Promise<Partial<RetrievalStateType>> => {
    const startTime = Date.now();

    // Skip if cache disabled or already a cache hit
    if (!state.useCache || state.cacheHit) {
      return {
        currentStage: 'update_cache_skipped',
      };
    }

    try {
      // Store in cache (service will check if all public)
      await qdrantCacheService.storeCache(
        state.queryEmbedding!,
        state.query,
        state.finalContexts,
        state.useCache,
      );

      const updateLatency = Date.now() - startTime;

      return {
        currentStage: 'update_cache',
        metrics: {
          ...state.metrics,
          cacheUpdateLatency: updateLatency,
        },
      };
    } catch (error) {
      // Non-critical: log but don't fail
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Cache update failed', { error: errorMessage });

      return {
        currentStage: 'update_cache_failed',
      };
    }
  };
}
```

---

## Cache Invalidation

### Strategies

**1. TTL-Based Cleanup (Scheduled)**

```typescript
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { QdrantCacheService } from './qdrant-cache.service';

@Injectable()
export class CacheInvalidationService {
  constructor(
    private readonly qdrantCacheService: QdrantCacheService,
  ) {}

  /**
   * Cleanup expired entries every hour
   */
  @Cron('0 * * * *')
  async cleanupExpiredCache(): Promise<void> {
    await this.qdrantCacheService.cleanupExpired();
  }
}
```

**2. Event-Driven Invalidation (Real-time)**

```typescript
import { EventPattern } from '@nestjs/microservices';

@Injectable()
export class CacheInvalidationService {
  constructor(
    private readonly qdrantCacheService: QdrantCacheService,
  ) {}

  /**
   * Invalidate cache when document updated
   */
  @EventPattern('document.updated')
  async handleDocumentUpdate(payload: { documentId: string }): Promise<void> {
    await this.qdrantCacheService.invalidateByDocument(payload.documentId);
  }

  /**
   * Invalidate cache when document deleted
   */
  @EventPattern('document.deleted')
  async handleDocumentDelete(payload: { documentId: string }): Promise<void> {
    await this.qdrantCacheService.invalidateByDocument(payload.documentId);
  }
}
```

### Invalidation Flow

```
Document Update Event
        │
        ▼
┌────────────────────┐
│ Datasource Service │ → Emit 'document.updated' event
└────────────────────┘
        │
        ▼
┌────────────────────┐
│ Retrieval Service  │ → Listen to event
└────────┬───────────┘
         │
         ▼
  ┌─────────────────────────────┐
  │ Delete from Qdrant cache    │
  │ where documentIds contains  │
  │ the updated documentId      │
  └─────────────────────────────┘
```

---

## Performance Considerations

### Latency Targets

| Operation | Target | Acceptable |
|-----------|--------|------------|
| Cache lookup (hit) | < 30ms | < 50ms |
| Cache lookup (miss) | < 50ms | < 100ms |
| Cache write | < 100ms | < 200ms |
| Total retrieval (cache hit) | < 100ms | < 200ms |
| Total retrieval (cache miss) | < 1.5s | < 2s |

### Hit Rate Expectations

**With 0.95 Similarity Threshold:**
- Expected hit rate: **30-40%**
- Conservative threshold ensures high precision
- Trade-off: Lower hit rate for higher relevance

**Factors affecting hit rate:**
- Query diversity (higher diversity → lower hit rate)
- Public document ratio (more public docs → higher hit rate)
- Cache TTL (longer TTL → higher hit rate)
- User behavior (repeated queries → higher hit rate)

### Optimization Tips

1. **Embedding Reuse:** Cache miss embeds query once, reuse for retrieval
2. **Background Updates:** Hit counter updates don't block response
3. **Batch Invalidation:** Group document updates for efficient deletion
4. **Index Optimization:** Payload indexes on `documentIds` and `timestamp`

---

## Testing Strategy

### Unit Tests

```typescript
describe('QdrantCacheService', () => {
  describe('storeCache', () => {
    it('should store cache when all contexts are public', async () => {
      const contexts = [
        { metadata: { documentType: 'public' }, ... },
        { metadata: { documentType: 'public' }, ... },
      ];

      await service.storeCache(embedding, query, contexts, true);

      // Verify upsert called
      expect(qdrantClient.upsert).toHaveBeenCalled();
    });

    it('should skip cache when contains private documents', async () => {
      const contexts = [
        { metadata: { documentType: 'public' }, ... },
        { metadata: { documentType: 'private' }, ... },
      ];

      await service.storeCache(embedding, query, contexts, true);

      // Verify upsert NOT called
      expect(qdrantClient.upsert).not.toHaveBeenCalled();
    });

    it('should skip cache when useCache is false', async () => {
      const contexts = [
        { metadata: { documentType: 'public' }, ... },
      ];

      await service.storeCache(embedding, query, contexts, false);

      expect(qdrantClient.upsert).not.toHaveBeenCalled();
    });
  });

  describe('searchCache', () => {
    it('should return cached entry when similarity >= 0.95', async () => {
      qdrantClient.search.mockResolvedValue([
        {
          id: 'uuid',
          score: 0.96,
          payload: mockCacheEntry,
        },
      ]);

      const result = await service.searchCache(embedding, true);

      expect(result).toEqual(mockCacheEntry);
    });

    it('should return null when TTL expired', async () => {
      const expiredEntry = {
        ...mockCacheEntry,
        timestamp: Date.now() - 4000 * 1000, // 4 hours ago
      };

      qdrantClient.search.mockResolvedValue([
        { id: 'uuid', score: 0.96, payload: expiredEntry },
      ]);

      const result = await service.searchCache(embedding, true);

      expect(result).toBeNull();
      expect(qdrantClient.delete).toHaveBeenCalled();
    });
  });
});
```

### Integration Tests

```typescript
describe('Semantic Cache Integration', () => {
  it('should cache and retrieve semantically similar queries', async () => {
    // Cache original query
    await executeRetrievalWorkflow({
      query: 'How to implement RAG with LangChain?',
      useCache: true,
    });

    // Query with similar semantics
    const result = await executeRetrievalWorkflow({
      query: 'LangChain RAG implementation guide',
      useCache: true,
    });

    expect(result.metrics.cacheHit).toBe(true);
    expect(result.metrics.totalDuration).toBeLessThan(100);
  });

  it('should not cache when contexts contain private documents', async () => {
    // Mix of public and private
    const result = await executeRetrievalWorkflow({
      query: 'Query with mixed documents',
      useCache: true,
    });

    // Verify cache was skipped
    const cacheCheck = await qdrantClient.search('query_cache_public', {
      vector: result.queryEmbedding,
      limit: 1,
    });

    expect(cacheCheck.length).toBe(0);
  });
});
```

---

## Monitoring & Metrics

### Key Metrics to Track

```typescript
interface CacheMetrics {
  // Hit rate
  cacheHitRate: number;        // hits / (hits + misses)
  cacheHits: number;
  cacheMisses: number;

  // Latency
  avgCacheHitLatency: number;  // Target: < 50ms
  p95CacheHitLatency: number;
  avgCacheMissLatency: number;

  // Size
  cacheSize: number;           // Number of entries
  cacheSizeMB: number;         // Storage size

  // Invalidation
  invalidationEvents: number;  // Per hour
  ttlCleanupCount: number;     // Entries removed per cleanup

  // Similarity distribution
  avgSimilarityScore: number;  // For cache hits
  minSimilarityScore: number;  // Should be ~0.95
}
```

### Logging Examples

```typescript
// Cache HIT
logger.info('Semantic cache HIT', {
  query: state.query,
  similarity: 0.97,
  age: 1234567,  // milliseconds
  hits: 42,
  latency: 35,
});

// Cache MISS
logger.debug('Semantic cache MISS', {
  query: state.query,
  latency: 45,
});

// Cache SKIP (private documents)
logger.log('Skipping cache: contains non-public documents', {
  query: state.query,
  publicCount: 5,
  privateCount: 2,
});

// Cache invalidation
logger.log('Invalidated cache for document', {
  documentId: 'doc-123',
  entriesDeleted: 12,
});
```

### Dashboard Panels

1. **Cache Hit Rate (%)** - Time series
2. **Cache Latency (ms)** - P50, P95, P99
3. **Cache Size** - Number of entries over time
4. **Similarity Score Distribution** - Histogram
5. **Invalidation Rate** - Events per hour
6. **Cache Storage (MB)** - Growth trend

---

## Summary

**Benefits of Public-Only Semantic Cache:**

✅ **Security:** Zero risk of permission leaks
✅ **Simplicity:** No complex RBAC logic needed
✅ **Performance:** < 50ms cache lookups
✅ **Sharing:** All users benefit from same cache
✅ **Semantic:** "How to use RAG" matches "RAG usage guide"
✅ **Consistency:** Same Qdrant stack as retrieval & indexing
✅ **User Control:** `useCache` flag from frontend
✅ **Non-Critical:** Failures don't break retrieval

**Trade-offs Accepted:**

- ⚠️ Only public documents cached (private queries always hit retrieval)
- ⚠️ 20-50ms latency vs 1-5ms for Redis exact match
- ⚠️ 30-40% hit rate with conservative 0.95 threshold

**Expected Impact:**

- 📉 Reduce retrieval latency by 30-40% (for cacheable queries)
- 📉 Reduce load on Qdrant, TEI, MySQL by 30-40%
- 📈 Improve user experience for common public queries
- 📈 Higher cache sharing across all users

---

**End of Document**
