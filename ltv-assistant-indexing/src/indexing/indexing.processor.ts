import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IndexingService } from './indexing.service';
import { IndexingWorkflowService } from './workflow';

interface FileJobData {
  type: 'file.index' | 'file.delete';
  fileId: string;
  documentId: string;
  filename: string;
  filePath: string;
  fileSize: number;
  mimeType: string | null;
}

@Processor('file-indexing', {
  concurrency: 1, // Maximum 2 parallel jobs globally (reduced from 5 to prevent LLM overload)
})
export class IndexingProcessor extends WorkerHost {
  private readonly logger = new Logger(IndexingProcessor.name);

  constructor(
    private readonly indexingService: IndexingService,
    private readonly workflowService: IndexingWorkflowService,
  ) {
    super();
  }

  async process(job: Job<FileJobData>): Promise<void> {
    const { type } = job.data;

    if (type === 'file.index') {
      await this.processFileIndex(job);
    } else if (type === 'file.delete') {
      await this.processFileDelete(job);
    }
  }

  private async processFileIndex(job: Job<FileJobData>): Promise<void> {
    const { fileId, documentId, filename, filePath, fileSize, mimeType } =
      job.data;

    this.logger.log('='.repeat(80));
    this.logger.log(`Processing file indexing job:`);
    this.logger.log(`  Job ID: ${job.id}`);
    this.logger.log(`  File ID: ${fileId}`);
    this.logger.log(`  Document ID: ${documentId}`);
    this.logger.log(`  Filename: ${filename}`);
    this.logger.log(`  File Path: ${filePath}`);
    this.logger.log(`  File Size: ${fileSize} bytes`);
    this.logger.log(`  MIME Type: ${mimeType}`);
    this.logger.log('='.repeat(80));

    try {
      // Create job record in database
      await this.indexingService.createJob({
        fileId,
        documentId,
        filename,
        jobId: String(job.id),
      });

      // Update status to processing
      await this.indexingService.updateJobStatus(String(job.id), 'processing');

      // Execute LangGraph Workflow
      this.logger.log('Executing LangGraph indexing workflow...');

      const workflowResult = await this.workflowService.executeWorkflow({
        fileId,
        documentId,
        filePath,
        filename,
        mimeType,
      });

      if (!workflowResult.success) {
        throw new Error(`Workflow failed: ${workflowResult.errors.join(', ')}`);
      }

      this.logger.log(
        `✓ Workflow completed successfully - ` +
          `Duration: ${workflowResult.metrics.duration}ms, ` +
          `Stages: ${workflowResult.metrics.stagesCompleted.join(' → ')}`,
      );

      // Update status to completed
      await this.indexingService.updateJobStatus(String(job.id), 'completed');

      this.logger.log('='.repeat(80));
      this.logger.log(`✓ Completed file indexing for: ${filename}`);
      this.logger.log(`  File ID: ${fileId}`);
      this.logger.log('='.repeat(80));
    } catch (error) {
      this.logger.error(
        `Failed to process file indexing for ${filename}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Update job status to failed
      await this.indexingService.updateJobStatus(
        String(job.id),
        'failed',
        error instanceof Error ? error.message : String(error),
      );

      throw error;
    }
  }

  private async processFileDelete(job: Job<FileJobData>): Promise<void> {
    const { fileId, filePath } = job.data;

    this.logger.log('='.repeat(80));
    this.logger.log(`Processing file deletion job:`);
    this.logger.log(`  Job ID: ${job.id}`);
    this.logger.log(`  File ID: ${fileId}`);
    this.logger.log(`  File Path: ${filePath}`);
    this.logger.log('='.repeat(80));

    try {
      await this.indexingService.deleteIndexedFile(fileId);
      this.logger.log(`✓ Indexed data deleted for file ${fileId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete indexed data for file ${fileId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job<FileJobData>): void {
    this.logger.log(`Job ${job.id} is now active (type: ${job.data.type})`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<FileJobData>): void {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<FileJobData> | undefined, error: Error): void {
    if (job) {
      this.logger.error(`Job ${job.id} failed with error:`, error.message);
      void this.indexingService.incrementAttempts(String(job.id));
    }
  }
}
