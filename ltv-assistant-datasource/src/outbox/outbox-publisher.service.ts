import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database.module';
import { outboxEvents } from '../database/schema';
import * as schema from '../database/schema';
import { FileIndexJobData } from '../queue/indexing-job.producer';

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly enabled: boolean;
  private readonly batchSize: number;
  private readonly maxWaitingBacklog: number;
  private readonly maxRetryCount: number;
  private readonly retryBackoffBase: number;
  private isPublishing = false;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: MySql2Database<typeof schema>,
    private configService: ConfigService,
    @InjectQueue('file-indexing')
    private readonly fileIndexingQueue: Queue<FileIndexJobData>,
  ) {
    this.enabled = this.configService.get<boolean>(
      'OUTBOX_PUBLISHER_ENABLED',
      true,
    );
    this.batchSize = this.configService.get<number>(
      'OUTBOX_PUBLISH_BATCH_SIZE',
      3,
    );
    this.maxWaitingBacklog = this.configService.get<number>(
      'OUTBOX_MAX_WAITING_BACKLOG',
      3,
    );
    this.maxRetryCount = this.configService.get<number>(
      'OUTBOX_MAX_RETRY_COUNT',
      10,
    );
    this.retryBackoffBase = this.configService.get<number>(
      'OUTBOX_RETRY_BACKOFF_BASE_SECONDS',
      2,
    );

    this.logger.log(`Outbox Publisher initialized (enabled: ${this.enabled})`);
    if (this.enabled) {
      this.logger.log(
        `Configuration: batch=${this.batchSize}, maxBacklog=${this.maxWaitingBacklog}, maxRetry=${this.maxRetryCount}`,
      );
    }
  }

  /**
   * Cron job that runs every 5 seconds to publish pending outbox events
   * Includes backpressure control to avoid overloading the queue
   */
  @Cron('*/5 * * * * *') // Every 5 seconds
  async publishPendingEvents(): Promise<void> {
    if (!this.enabled || this.isPublishing) {
      return;
    }

    this.logger.log('Checking for pending events');

    this.isPublishing = true;
    try {
      // Step 1: Check backpressure - verify queue is not overloaded
      const queueMetrics = await this.fileIndexingQueue.getJobCounts(
        'active',
        'waiting',
      );

      if (
        queueMetrics.active >= 1 ||
        queueMetrics.waiting >= this.maxWaitingBacklog
      ) {
        this.logger.log(
          `Skipping publish cycle due to backpressure: active=${queueMetrics.active}, waiting=${queueMetrics.waiting}`,
        );
        return;
      }

      // Step 2: Fetch pending events with FOR UPDATE SKIP LOCKED for safe concurrency
      const pendingEvents = await this.fetchPendingEvents();

      if (pendingEvents.length === 0) {
        return;
      }

      this.logger.log(
        `Publishing ${pendingEvents.length} outbox event(s) to queue`,
      );

      // Step 3: Publish each event
      for (const event of pendingEvents) {
        await this.publishEvent(event);
      }
    } catch (error) {
      this.logger.error(
        'Error in publisher cron job',
        error instanceof Error ? error.stack : String(error),
      );

      // Mark any events stuck in 'publishing' status as 'failed'
      try {
        await this.db
          .update(outboxEvents)
          .set({
            status: 'failed',
            errorLog: `Publisher error: ${error instanceof Error ? error.message : String(error)}`,
          })
          .where(sql`status = 'publishing'`);
      } catch (updateError) {
        this.logger.error(
          'Failed to update stuck events to failed status',
          updateError instanceof Error
            ? updateError.stack
            : String(updateError),
        );
      }
    } finally {
      this.isPublishing = false;
    }
  }

  /**
   * Fetch pending events using FOR UPDATE SKIP LOCKED
   * This ensures concurrent publishers don't process the same events
   */
  private async fetchPendingEvents(): Promise<schema.OutboxEvent[]> {
    try {
      const result = await this.db.execute<schema.OutboxEvent[]>(
        sql`SELECT * FROM outbox_events
            WHERE status = 'pending'
            AND available_at <= NOW()
            ORDER BY created_at ASC
            LIMIT ${sql.raw(String(this.batchSize))}
            FOR UPDATE SKIP LOCKED`,
      );

      // MySQL returns snake_case column names, map to camelCase
      type RawRow = {
        id: string;
        aggregate_type: string;
        aggregate_id: string;
        event_type: string;
        payload_json: string;
        payload_schema_version: number;
        payload_checksum: string;
        status: 'pending' | 'publishing' | 'published' | 'failed' | 'poison';
        retry_count: number;
        available_at: string | Date;
        published_at: string | Date | null;
        error_log: string | null;
        created_at: string | Date;
        updated_at: string | Date;
      };

      const rows = (result[0] as unknown as RawRow[]) || [];
      return rows.map((row) => ({
        id: row.id,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        payloadJson: row.payload_json,
        payloadSchemaVersion: row.payload_schema_version,
        payloadChecksum: row.payload_checksum,
        status: row.status,
        retryCount: row.retry_count,
        availableAt: new Date(row.available_at),
        publishedAt: row.published_at ? new Date(row.published_at) : null,
        errorLog: row.error_log,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      this.logger.error(
        'Failed to fetch pending events',
        error instanceof Error ? error.stack : String(error),
      );
      return [];
    }
  }

  /**
   * Publish a single outbox event to BullMQ
   */
  private async publishEvent(event: schema.OutboxEvent): Promise<void> {
    try {
      // Step 1: Update status to 'publishing'
      await this.db
        .update(outboxEvents)
        .set({ status: 'publishing' })
        .where(eq(outboxEvents.id, event.id));

      // Step 2: Parse payload
      const payload = JSON.parse(event.payloadJson) as {
        documentId: string;
        fileId: string;
        filePath: string;
        filename: string;
        mimeType: string | null;
        fileSize: number;
      };

      // Step 3: Push to BullMQ with jobId = outboxId for idempotency
      await this.fileIndexingQueue.add(
        'file.index',
        {
          type: 'file.index',
          ...payload,
        },
        {
          jobId: event.id, // Use outbox ID as job ID for deduplication
        },
      );

      // Step 4: Update status to 'published'
      await this.db
        .update(outboxEvents)
        .set({
          status: 'published',
          publishedAt: sql`NOW()`,
        })
        .where(eq(outboxEvents.id, event.id));

      this.logger.log(
        `✓ Published outbox event ${event.id} (file: ${payload.filename})`,
      );
    } catch (error) {
      await this.handlePublishFailure(event, error);
    }
  }

  /**
   * Handle publish failure with exponential backoff retry logic
   */
  private async handlePublishFailure(
    event: schema.OutboxEvent,
    error: unknown,
  ): Promise<void> {
    const newRetryCount = event.retryCount + 1;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (newRetryCount > this.maxRetryCount) {
      // Mark as poison pill - requires manual intervention
      await this.db
        .update(outboxEvents)
        .set({
          status: 'poison',
          errorLog: `Max retries (${this.maxRetryCount}) exceeded. Last error: ${errorMessage}`,
        })
        .where(eq(outboxEvents.id, event.id));

      this.logger.error(
        `⚠ Outbox event ${event.id} marked as POISON after ${newRetryCount} attempts. Requires manual intervention.`,
      );
    } else {
      // Calculate exponential backoff: 2^retryCount seconds
      const backoffSeconds = Math.pow(this.retryBackoffBase, newRetryCount);

      await this.db
        .update(outboxEvents)
        .set({
          status: 'failed',
          retryCount: newRetryCount,
          availableAt: sql`DATE_ADD(NOW(), INTERVAL ${sql.raw(String(backoffSeconds))} SECOND)`,
          errorLog: errorMessage,
        })
        .where(eq(outboxEvents.id, event.id));

      this.logger.warn(
        `⚠ Outbox event ${event.id} failed, will retry ${newRetryCount}/${this.maxRetryCount} in ${backoffSeconds}s. Error: ${errorMessage}`,
      );
    }
  }
}
