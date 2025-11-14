/**
 * Cache Invalidation Service
 * Handles TTL-based cleanup and event-driven invalidation
 * Based on PRD Phase 1.5 & docs/semantic-cache-design.md
 *
 * Strategies:
 * 1. TTL-based cleanup: Cron job runs every hour to delete expired entries
 * 2. Event-driven: Invalidate cache when documents are updated/deleted
 *
 * Pattern: docs/semantic-cache-design.md (Lines 657-709)
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventPattern } from '@nestjs/microservices';
import { QdrantCacheService } from './qdrant-cache.service';

/**
 * Document update event payload
 */
interface DocumentUpdateEvent {
  documentId: string;
}

/**
 * Document delete event payload
 */
interface DocumentDeleteEvent {
  documentId: string;
}

@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(private readonly qdrantCacheService: QdrantCacheService) {}

  /**
   * TTL-based cleanup (scheduled)
   * Runs every hour to delete expired cache entries
   * Cron expression: '0 * * * *' = every hour at minute 0
   */
  @Cron('0 * * * *')
  async cleanupExpiredCache(): Promise<void> {
    this.logger.log('Running scheduled cache cleanup (TTL-based)...');

    try {
      await this.qdrantCacheService.cleanupExpired();
      this.logger.log('✓ Scheduled cache cleanup completed');
    } catch (error) {
      this.logger.error(
        'Scheduled cache cleanup failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Event-driven invalidation: Document updated
   * Listens to 'document.updated' events from Datasource service
   * Invalidates all cache entries containing the updated document
   */
  @EventPattern('document.updated')
  async handleDocumentUpdate(payload: DocumentUpdateEvent): Promise<void> {
    this.logger.log(`Received document.updated event: ${payload.documentId}`);

    try {
      await this.qdrantCacheService.invalidateByDocument(payload.documentId);
      this.logger.log(
        `✓ Cache invalidated for updated document: ${payload.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        'Document update cache invalidation failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Event-driven invalidation: Document deleted
   * Listens to 'document.deleted' events from Datasource service
   * Invalidates all cache entries containing the deleted document
   */
  @EventPattern('document.deleted')
  async handleDocumentDelete(payload: DocumentDeleteEvent): Promise<void> {
    this.logger.log(`Received document.deleted event: ${payload.documentId}`);

    try {
      await this.qdrantCacheService.invalidateByDocument(payload.documentId);
      this.logger.log(
        `✓ Cache invalidated for deleted document: ${payload.documentId}`,
      );
    } catch (error) {
      this.logger.error(
        'Document delete cache invalidation failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Manual cache cleanup (for maintenance/testing)
   * Can be called via TCP endpoint or admin API
   */
  async manualCleanup(): Promise<{
    success: boolean;
    message: string;
  }> {
    this.logger.log('Running manual cache cleanup...');

    try {
      await this.qdrantCacheService.cleanupExpired();
      return {
        success: true,
        message: 'Manual cache cleanup completed successfully',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Manual cache cleanup failed', errorMessage);
      return {
        success: false,
        message: `Manual cache cleanup failed: ${errorMessage}`,
      };
    }
  }
}
