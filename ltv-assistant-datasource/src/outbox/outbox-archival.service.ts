import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { lte, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database.module';
import { outboxEvents } from '../database/schema';
import * as schema from '../database/schema';

@Injectable()
export class OutboxArchivalService {
  private readonly logger = new Logger(OutboxArchivalService.name);
  private readonly archiveAfterDays = 90;
  private isArchiving = false;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: MySql2Database<typeof schema>,
  ) {
    this.logger.log(
      `Outbox Archival Service initialized (archive after ${this.archiveAfterDays} days)`,
    );
  }

  /**
   * Daily archival job that runs at 2 AM
   * Archives outbox events older than 90 days
   */
  @Cron('0 2 * * *') // Daily at 2 AM
  async archiveOldEvents(): Promise<void> {
    if (this.isArchiving) {
      this.logger.warn('Archival already in progress, skipping');
      return;
    }

    this.isArchiving = true;
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.archiveAfterDays);

      this.logger.log(
        `Starting archival for events created before ${cutoffDate.toISOString()}`,
      );

      // Count events to archive
      const countResult = await this.db.execute<{ count: number }[]>(
        sql`SELECT COUNT(*) as count
            FROM outbox_events
            WHERE created_at <= ${cutoffDate}`,
      );

      const count =
        (countResult[0] as unknown as { count: number }[])[0]?.count ?? 0;

      if (count === 0) {
        this.logger.log('No events to archive');
        return;
      }

      this.logger.log(`Found ${count} event(s) to archive`);

      // Archive in transaction
      await this.db.transaction(async (tx) => {
        // Copy to archive table
        await tx.execute(
          sql`INSERT INTO outbox_events_archive
              (id, aggregate_type, aggregate_id, event_type, payload_json,
               payload_schema_version, payload_checksum, status, retry_count,
               available_at, published_at, error_log, created_at, updated_at, archived_at)
              SELECT
                id, aggregate_type, aggregate_id, event_type, payload_json,
                payload_schema_version, payload_checksum, status, retry_count,
                available_at, published_at, error_log, created_at, updated_at, NOW()
              FROM outbox_events
              WHERE created_at <= ${cutoffDate}`,
        );

        // Delete from main table
        await tx
          .delete(outboxEvents)
          .where(lte(outboxEvents.createdAt, cutoffDate));
      });

      this.logger.log(`✓ Successfully archived ${count} event(s)`);
    } catch (error) {
      this.logger.error(
        'Error archiving outbox events',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isArchiving = false;
    }
  }

  /**
   * Manual archival method for on-demand archival
   * Can be called via admin endpoint if needed
   */
  async archiveNow(): Promise<{ archived: number }> {
    if (this.isArchiving) {
      throw new Error('Archival already in progress');
    }

    this.logger.log('Manual archival triggered');
    await this.archiveOldEvents();

    // Return count
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.archiveAfterDays);

    const countResult = await this.db.execute<{ count: number }[]>(
      sql`SELECT COUNT(*) as count
          FROM outbox_events_archive
          WHERE archived_at >= NOW() - INTERVAL 5 MINUTE`,
    );

    const archived =
      (countResult[0] as unknown as { count: number }[])[0]?.count ?? 0;

    return { archived };
  }
}
