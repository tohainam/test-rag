import { Injectable, Inject, Logger } from '@nestjs/common';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { DATABASE_CONNECTION } from '../database/database.module';
import { outboxEvents } from '../database/schema';
import * as schema from '../database/schema';

export interface OutboxEventPayload {
  documentId: string;
  fileId: string;
  filePath: string;
  filename: string;
  mimeType: string | null;
  fileSize: number;
  uploadUserId: string;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: MySql2Database<typeof schema>,
  ) {}

  /**
   * Create a new outbox event for file upload
   * This method should be called within a transaction
   */
  async createOutboxEvent(payload: OutboxEventPayload): Promise<string> {
    const eventId = uuidv4();
    const payloadJson = JSON.stringify(payload);
    const checksum = this.generateChecksum(payloadJson);

    await this.db.insert(outboxEvents).values({
      id: eventId,
      aggregateType: 'FILE',
      aggregateId: payload.fileId,
      eventType: 'DOCUMENT_FILE_UPLOADED',
      payloadJson,
      payloadSchemaVersion: 1,
      payloadChecksum: checksum,
      status: 'pending',
      retryCount: 0,
      availableAt: new Date(),
    });

    this.logger.log(
      `Created outbox event ${eventId} for file ${payload.fileId} (${payload.filename})`,
    );
    return eventId;
  }

  /**
   * Generate SHA-256 checksum for payload
   * Used for data integrity verification
   */
  private generateChecksum(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }
}
