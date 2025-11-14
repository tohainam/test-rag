/**
 * Qdrant Initialization Service
 * Automatically creates required collections on module initialization
 */

import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_CLIENT } from '../persist.constants';
import { EmbeddingProviderFactory } from '../../embed/embedding-provider.factory';

@Injectable()
export class QdrantInitService implements OnModuleInit {
  private readonly logger = new Logger(QdrantInitService.name);

  // Collection names (hardcoded - must match retrieval service)
  private readonly COLLECTION_CHILDREN = 'documents_children';
  private readonly COLLECTION_SUMMARIES = 'documents_summaries';
  private readonly COLLECTION_QUESTIONS = 'documents_questions';

  // Vector dimensions (dynamically determined from embedding model)
  private readonly denseVectorSize: number;

  constructor(
    @Inject(QDRANT_CLIENT) private readonly qdrantClient: QdrantClient,
    private readonly embeddingProviderFactory: EmbeddingProviderFactory,
  ) {
    // Get dimensions from configured embedding model
    this.denseVectorSize =
      this.embeddingProviderFactory.getEmbeddingDimensions();
    this.logger.log(`Qdrant vector dimensions: ${this.denseVectorSize}D`);
  }

  /**
   * Initialize Qdrant collections on module startup
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Qdrant collections...');

    try {
      // Create all required collections
      await this.ensureCollectionExists(this.COLLECTION_CHILDREN);
      await this.ensureCollectionExists(this.COLLECTION_SUMMARIES);
      await this.ensureCollectionExists(this.COLLECTION_QUESTIONS);

      this.logger.log('✅ Qdrant initialization complete');
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `❌ Failed to initialize Qdrant collections: ${errorMessage}`,
      );
      throw error;
    }
  }

  /**
   * Check if collection exists, create if it doesn't
   */
  private async ensureCollectionExists(collectionName: string): Promise<void> {
    try {
      // Try to get collection info - if it exists, this will succeed
      await this.qdrantClient.getCollection(collectionName);
      this.logger.log(`Collection "${collectionName}" already exists`);
      return;
    } catch {
      // Collection doesn't exist, create it
      this.logger.log(`Creating collection "${collectionName}"...`);

      await this.qdrantClient.createCollection(collectionName, {
        vectors: {
          // Named dense vector for semantic search (dimensions from embedding model)
          dense: {
            size: this.denseVectorSize,
            distance: 'Cosine',
          },
        },
        sparse_vectors: {
          // Named sparse vector for keyword/hybrid search
          sparse: {},
        },
        // Optimization settings for production
        optimizers_config: {
          memmap_threshold: 20000, // Use memory-mapped storage for large collections
        },
        // Enable indexing on payload fields for filtering
        on_disk_payload: false, // Keep payload in memory for faster filtering
      });

      this.logger.log(`✅ Created collection "${collectionName}"`);

      // Create payload indexes for common filters
      await this.createPayloadIndexes(collectionName);
    }
  }

  /**
   * Create payload indexes for efficient filtering
   */
  private async createPayloadIndexes(collectionName: string): Promise<void> {
    try {
      // Index documentId for deduplication and filtering
      await this.qdrantClient.createPayloadIndex(collectionName, {
        field_name: 'documentId',
        field_schema: 'keyword',
      });

      // Index parentChunkId for parent chunk lookup
      await this.qdrantClient.createPayloadIndex(collectionName, {
        field_name: 'parentChunkId',
        field_schema: 'keyword',
      });

      this.logger.log(
        `Created payload indexes for collection "${collectionName}"`,
      );
    } catch (error: unknown) {
      // Log warning but don't fail - indexes may already exist
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Could not create payload indexes for "${collectionName}": ${errorMessage}`,
      );
    }
  }
}
