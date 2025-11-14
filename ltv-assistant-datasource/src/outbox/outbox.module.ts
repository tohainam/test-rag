import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { OutboxService } from './outbox.service';
import { OutboxPublisherService } from './outbox-publisher.service';
import { OutboxArchivalService } from './outbox-archival.service';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../queue/queue.module';

/**
 * Outbox Pattern Module
 *
 * Provides reliable, exactly-once message delivery from datasource to indexing service.
 *
 * Components:
 * - OutboxService: Creates outbox events when files are uploaded
 * - OutboxPublisherService: Publishes pending events to BullMQ (cron: every 5s)
 * - OutboxArchivalService: Archives events older than 90 days (cron: daily at 2 AM)
 *
 * Flow:
 * 1. FilesService uploads file → calls OutboxService.createOutboxEvent() in transaction
 * 2. OutboxPublisherService periodically checks for pending events
 * 3. Publisher pushes to BullMQ with backpressure control
 * 4. Updates event status: pending → publishing → published
 * 5. Failed events retry with exponential backoff
 * 6. Events exceeding max retries marked as 'poison' for manual intervention
 */
@Module({
  imports: [
    ScheduleModule.forRoot(), // Enable cron jobs
    DatabaseModule,
    QueueModule,
    BullModule.registerQueue({
      name: 'file-indexing', // Register the queue for publisher to use
    }),
  ],
  providers: [OutboxService, OutboxPublisherService, OutboxArchivalService],
  exports: [OutboxService], // Export for use in FilesModule
})
export class OutboxModule {}
