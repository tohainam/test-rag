/**
 * Qdrant Cache Service
 * Implements semantic caching with Qdrant vector database
 * Based on PRD Phase 1.5 & docs/semantic-cache-design.md
 *
 * Strategy: Public documents only - Cache ONLY when ALL contexts are public
 * Similarity threshold: 0.95 (conservative)
 * Collection: query_cache_public
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import type { Context } from '../types';
import type { PublicCacheEntry } from '../types/cache.types';
import { CACHE_CONSTANTS } from '../types/cache.types';
import * as crypto from 'crypto';

@Injectable()
export class QdrantCacheService implements OnModuleInit {
  private readonly logger = new Logger(QdrantCacheService.name);

  private readonly client: QdrantClient;
  private readonly CACHE_COLLECTION: string;
  private readonly SIMILARITY_THRESHOLD: number;
  private readonly DEFAULT_TTL: number;
  private readonly cacheEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    // Initialize Qdrant client (same pattern as QdrantService)
    const url = this.configService.get<string>(
      'QDRANT_URL',
      'http://localhost:6333',
    );
    this.client = new QdrantClient({ url });
    // Load configuration with fallback to constants
    this.CACHE_COLLECTION = this.configService.get<string>(
      'CACHE_COLLECTION_NAME',
      CACHE_CONSTANTS.CACHE_COLLECTION,
    );

    this.SIMILARITY_THRESHOLD = this.configService.get<number>(
      'CACHE_SIMILARITY_THRESHOLD',
      CACHE_CONSTANTS.SIMILARITY_THRESHOLD,
    );

    this.DEFAULT_TTL = this.configService.get<number>(
      'CACHE_TTL',
      CACHE_CONSTANTS.DEFAULT_TTL,
    );

    this.cacheEnabled = this.configService.get<boolean>('CACHE_ENABLED', true);
  }

  /**
   * Initialize cache collection on module startup
   * Pattern from indexing service: QdrantInitService
   */
  async onModuleInit(): Promise<void> {
    if (!this.cacheEnabled) {
      this.logger.warn('Semantic cache is DISABLED');
      return;
    }

    try {
      await this.ensureCacheCollectionExists();
    } catch (error) {
      // Non-critical: cache initialization failure doesn't stop the service
      this.logger.error(
        'Cache collection initialization failed - cache will be disabled',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Ensure cache collection exists (same pattern as indexing service)
   * Creates collection with 1024D vectors (bge-m3) and payload indexes
   */
  private async ensureCacheCollectionExists(): Promise<void> {
    try {
      await this.client.getCollection(this.CACHE_COLLECTION);
      this.logger.log(`Cache collection "${this.CACHE_COLLECTION}" exists`);
    } catch {
      this.logger.log(
        `Creating cache collection "${this.CACHE_COLLECTION}"...`,
      );

      // Create collection with same vector config as indexing
      await this.client.createCollection(this.CACHE_COLLECTION, {
        vectors: {
          dense: {
            size: CACHE_CONSTANTS.VECTOR_DIMENSION, // 1024 for bge-m3:567m
            distance: CACHE_CONSTANTS.DISTANCE_METRIC, // Cosine
          },
        },
        optimizers_config: {
          memmap_threshold: 20000,
        },
        on_disk_payload: false, // Keep payload in memory for fast filtering
      });

      // Create payload indexes for efficient filtering
      await this.createPayloadIndexes();

      this.logger.log(
        `✓ Cache collection "${this.CACHE_COLLECTION}" created successfully`,
      );
    }
  }

  /**
   * Create payload indexes for filtering and TTL cleanup
   */
  private async createPayloadIndexes(): Promise<void> {
    try {
      // Index 1: documentIds (keyword) - for invalidation
      await this.client.createPayloadIndex(this.CACHE_COLLECTION, {
        field_name: 'documentIds',
        field_schema: 'keyword',
      });

      // Index 2: timestamp (integer) - for TTL cleanup
      await this.client.createPayloadIndex(this.CACHE_COLLECTION, {
        field_name: 'timestamp',
        field_schema: 'integer',
      });

      this.logger.log('✓ Cache payload indexes created');
    } catch (error) {
      this.logger.warn(
        `Could not create cache indexes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Search for cached query (semantic matching with 0.95 threshold)
   * Returns cached contexts if found and valid, null otherwise
   *
   * @param queryEmbedding - Query embedding vector (1024D)
   * @param useCache - Enable/disable cache lookup
   * @returns PublicCacheEntry if hit, null if miss
   */
  async searchCache(
    queryEmbedding: number[],
    useCache: boolean,
  ): Promise<PublicCacheEntry | null> {
    if (!useCache || !this.cacheEnabled) {
      return null;
    }

    try {
      // Validate embedding dimensions
      if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
        this.logger.error('Invalid query embedding - not an array', {
          type: typeof queryEmbedding,
          value: queryEmbedding,
        });
        return null;
      }

      if (queryEmbedding.length !== CACHE_CONSTANTS.VECTOR_DIMENSION) {
        this.logger.error('Query embedding dimension mismatch', {
          expected: CACHE_CONSTANTS.VECTOR_DIMENSION,
          actual: queryEmbedding.length,
          firstFewValues: queryEmbedding.slice(0, 5),
        });
        return null;
      }

      this.logger.log('Searching cache...', {
        collectionName: this.CACHE_COLLECTION,
        embeddingDim: queryEmbedding.length,
        threshold: this.SIMILARITY_THRESHOLD,
        embeddingType: typeof queryEmbedding,
        isArray: Array.isArray(queryEmbedding),
      });

      // Semantic search in Qdrant cache collection
      // For collections with named vectors, specify the vector name
      const searchParams = {
        vector: {
          name: 'dense',
          vector: queryEmbedding,
        },
        limit: 1,
        with_payload: true,
      };

      const results = await this.client.search(
        this.CACHE_COLLECTION,
        searchParams,
      );

      this.logger.log(`Cache search completed: ${results.length} results`);

      if (results.length === 0) {
        // Cache MISS
        this.logger.log('Cache MISS - No similar queries found');
        return null;
      }

      // Check similarity threshold manually
      const topResult = results[0];
      this.logger.log(
        `Cache result score: ${topResult.score}, threshold: ${this.SIMILARITY_THRESHOLD}`,
      );

      if (topResult.score < this.SIMILARITY_THRESHOLD) {
        this.logger.log(
          `Cache MISS - Similarity too low: ${topResult.score} < ${this.SIMILARITY_THRESHOLD}`,
        );
        return null;
      }

      this.logger.log(
        `Cache HIT - High similarity: ${topResult.score} >= ${this.SIMILARITY_THRESHOLD}`,
      );

      const cacheEntry = topResult.payload as unknown as PublicCacheEntry;

      this.logger.log('Cache entry parsed successfully', {
        cacheId: cacheEntry.cacheId,
        queryText: cacheEntry.queryText,
        contextCount: cacheEntry.contexts?.length || 0,
      });

      // Check TTL validity
      const age = Date.now() - cacheEntry.timestamp;
      if (age > cacheEntry.ttl * 1000) {
        // Expired - delete it
        await this.client.delete(this.CACHE_COLLECTION, {
          points: [results[0].id],
        });
        this.logger.log('Cache entry expired and deleted', {
          cacheId: cacheEntry.cacheId,
          age,
        });
        return null;
      }

      // Cache HIT - update hit counter in background
      this.incrementHitCounter(results[0].id, cacheEntry).catch((err) => {
        this.logger.warn(
          'Failed to increment hit counter',
          err instanceof Error ? err.message : String(err),
        );
      });

      this.logger.log('Semantic cache HIT', {
        queryText: cacheEntry.queryText,
        similarity: results[0].score,
        age,
        hits: cacheEntry.hits + 1,
      });

      return cacheEntry;
    } catch (error) {
      // Non-critical: cache search failure doesn't fail retrieval
      this.logger.error(
        'Cache search failed, continuing without cache',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /**
   * Store query results in cache
   *
   * IMPORTANT: This method stores ONLY public documents in cache.
   * The update-cache node fetches document details from datasource service
   * and verifies ALL documents are public before calling this method.
   *
   * SECURITY: No user-specific information (userId, userRole, etc.) is stored.
   * Contexts are sanitized to remove any sensitive data before caching.
   * This ensures cache can be safely shared across all users.
   *
   * @param queryEmbedding - Query embedding vector
   * @param queryText - Original query text
   * @param contexts - Retrieved contexts (pre-verified as public)
   * @param useCache - Enable/disable cache storage
   */
  async storeCache(
    queryEmbedding: number[],
    queryText: string,
    contexts: Context[],
    useCache: boolean,
  ): Promise<void> {
    if (!useCache || !this.cacheEnabled) {
      return;
    }

    try {
      // Sanitize contexts to remove any user-specific data
      // Only keep the essential retrieval data
      const sanitizedContexts = contexts.map((ctx) => ({
        parentChunkId: ctx.parentChunkId,
        documentId: ctx.documentId,
        content: ctx.content,
        tokens: ctx.tokens,
        score: ctx.score,
        metadata: ctx.metadata,
        sources: ctx.sources,
      }));

      // Create cache entry
      const cacheEntry: PublicCacheEntry = {
        cacheId: crypto.randomUUID(),
        queryText,
        contexts: sanitizedContexts,
        documentIds: [...new Set(contexts.map((c) => c.documentId))],
        timestamp: Date.now(),
        ttl: this.DEFAULT_TTL,
        hits: 0,
        lastAccess: Date.now(),
      };

      this.logger.log('Preparing to store cache...', {
        cacheId: cacheEntry.cacheId,
        contextCount: sanitizedContexts.length,
      });

      // Serialize payload to JSON to ensure all nested objects are properly stored
      const payload = JSON.parse(JSON.stringify(cacheEntry)) as Record<
        string,
        unknown
      >;

      this.logger.log('Payload serialized, upserting to Qdrant...');

      // Upsert to Qdrant
      await this.client.upsert(this.CACHE_COLLECTION, {
        points: [
          {
            id: this.stringToUuid(cacheEntry.cacheId),
            vector: {
              dense: queryEmbedding,
            },
            payload: payload,
          },
        ],
        wait: true,
      });

      this.logger.log('Cache stored successfully', {
        queryText,
        contextCount: contexts.length,
        documentIds: cacheEntry.documentIds,
        cacheId: cacheEntry.cacheId,
      });
    } catch (error) {
      // Non-critical: cache store failure doesn't fail retrieval
      this.logger.warn(
        'Cache store failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Invalidate cache entries containing specific document
   * Used when document is updated or deleted
   *
   * @param documentId - Document ID to invalidate
   */
  async invalidateByDocument(documentId: string): Promise<void> {
    if (!this.cacheEnabled) {
      return;
    }

    try {
      await this.client.delete(this.CACHE_COLLECTION, {
        filter: {
          must: [
            {
              key: 'documentIds',
              match: { any: [documentId] },
            },
          ],
        },
      });

      this.logger.log(`Invalidated cache for document ${documentId}`);
    } catch (error) {
      this.logger.error(
        'Cache invalidation failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Cleanup expired cache entries (cron job)
   * Deletes all entries with timestamp < (now - TTL)
   */
  async cleanupExpired(): Promise<void> {
    if (!this.cacheEnabled) {
      return;
    }

    try {
      const now = Date.now();
      const cutoff = now - this.DEFAULT_TTL * 1000;

      await this.client.delete(this.CACHE_COLLECTION, {
        filter: {
          must: [
            {
              key: 'timestamp',
              range: { lt: cutoff },
            },
          ],
        },
      });

      this.logger.log('Cleaned up expired cache entries', {
        cutoffTime: new Date(cutoff).toISOString(),
      });
    } catch (error) {
      this.logger.error(
        'Cache cleanup failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Increment hit counter for cache entry (background operation)
   */
  private async incrementHitCounter(
    pointId: string | number,
    cacheEntry: PublicCacheEntry,
  ): Promise<void> {
    await this.client.setPayload(this.CACHE_COLLECTION, {
      points: [pointId],
      payload: {
        hits: cacheEntry.hits + 1,
        lastAccess: Date.now(),
      },
    });
  }

  /**
   * Convert string to UUID format (same pattern as indexing service)
   */
  private stringToUuid(str: string): string {
    const hash = crypto.createHash('md5').update(str).digest('hex');
    return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-${((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hash.substring(18, 20)}-${hash.substring(20, 32)}`;
  }

  /**
   * Health check for cache service
   */
  async healthCheck(): Promise<boolean> {
    if (!this.cacheEnabled) {
      return true; // Cache disabled is not unhealthy
    }

    try {
      await this.client.getCollection(this.CACHE_COLLECTION);
      return true;
    } catch {
      return false;
    }
  }
}
