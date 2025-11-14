/**
 * Cache Types & Constants
 * Based on PRD Section "Phase 1.5: Semantic Caching Optimization"
 * Reference: docs/semantic-cache-design.md
 */

import type { Context } from './index';

/**
 * Public Cache Entry
 * Stored in Qdrant collection 'query_cache_public'
 * Only contains public documents to ensure zero permission leaks
 */
export interface PublicCacheEntry {
  // ===== Cache Identification =====
  cacheId: string; // UUID (random)
  queryText: string; // Original query string (for debugging & logging)

  // ===== Cached Data =====
  contexts: Context[]; // Full retrieval results (all public documents)

  // ===== Invalidation Tracking =====
  documentIds: string[]; // Unique document IDs in contexts (for invalidation)

  // ===== Metrics & TTL =====
  timestamp: number; // Unix timestamp (milliseconds) when cached
  ttl: number; // Time-to-live in seconds (default: 3600)
  hits: number; // Cache hit counter (incremented on each hit)
  lastAccess: number; // Last access timestamp (for monitoring)
}

/**
 * Cache Configuration Constants
 */
export const CACHE_CONSTANTS = {
  /**
   * Qdrant collection name for semantic cache
   */
  CACHE_COLLECTION: 'query_cache_public',

  /**
   * Semantic similarity threshold (conservative)
   * Only queries with similarity >= 0.95 will be cache hits
   */
  SIMILARITY_THRESHOLD: 0.95,

  /**
   * Default TTL in seconds (1 hour)
   */
  DEFAULT_TTL: 3600,

  /**
   * Vector dimension (must match embedding model)
   * bge-m3:567m = 1024D (same as indexing service)
   */
  VECTOR_DIMENSION: 1024,

  /**
   * Vector distance metric
   */
  DISTANCE_METRIC: 'Cosine' as const,
} as const;

/**
 * Cache Metrics Interface
 */
export interface CacheMetrics {
  cacheHitRate: number; // hits / (hits + misses)
  cacheHits: number;
  cacheMisses: number;
  avgCacheHitLatency: number;
  p95CacheHitLatency: number;
  avgCacheMissLatency: number;
  cacheSize: number; // Number of entries
  invalidationEvents: number; // Per hour
  avgSimilarityScore: number; // For cache hits
}
