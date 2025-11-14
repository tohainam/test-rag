import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface FileIndexJobData {
  type: 'file.index' | 'file.delete';
  fileId: string;
  documentId: string;
  filename: string;
  filePath: string;
  fileSize: number;
  mimeType: string | null;
}

@Injectable()
export class IndexingJobProducer {
  private readonly logger = new Logger(IndexingJobProducer.name);

  constructor(
    @InjectQueue('file-indexing')
    private readonly fileIndexingQueue: Queue<FileIndexJobData>,
  ) {}

  async addFileIndexingJob(
    jobData: Omit<FileIndexJobData, 'type'>,
  ): Promise<void> {
    try {
      const job = await this.fileIndexingQueue.add('file.index', {
        type: 'file.index',
        ...jobData,
      });

      this.logger.log(
        `File indexing job added for file ${jobData.fileId} (Job ID: ${job.id})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add file indexing job for file ${jobData.fileId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async addFileDeletionJob(fileId: string, filePath: string): Promise<void> {
    try {
      const job = await this.fileIndexingQueue.add(
        'file.delete',
        {
          type: 'file.delete',
          fileId,
          documentId: '',
          filename: '',
          filePath,
          fileSize: 0,
          mimeType: null,
        },
        {
          priority: 5,
        },
      );

      this.logger.log(
        `File deletion job added for file ${fileId} (Job ID: ${job.id})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add file deletion job for file ${fileId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
