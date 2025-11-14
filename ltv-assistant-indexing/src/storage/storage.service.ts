import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { Readable } from 'stream';
import type { StorageProvider } from './interfaces';
import { STORAGE_PROVIDER } from './storage.provider.factory';

/**
 * StorageService for Indexing Service
 * This service provides READ-ONLY access to files in MinIO/S3
 * All write operations (upload, delete) are handled by the Datasource Service
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {
    this.logger.log('StorageService initialized (read-only mode)');
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.storageProvider.ensureBucket();
      this.logger.log('Storage bucket validated successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to validate storage bucket: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Check if file exists in storage
   * @param objectName - Object name in storage
   * @returns true if file exists, false otherwise
   */
  async fileExists(objectName: string): Promise<boolean> {
    try {
      return await this.storageProvider.objectExists(objectName);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error checking file existence: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get file metadata (size, content type, etc.)
   * @param objectName - Object name in storage
   * @returns File metadata
   */
  async getFileMetadata(objectName: string): Promise<{
    size: number;
    lastModified: Date | null;
    etag: string | null;
    contentType: string | null;
  }> {
    try {
      const metadata = await this.storageProvider.getMetadata(objectName);

      return {
        size: metadata.contentLength,
        lastModified: metadata.lastModified,
        etag: metadata.etag,
        contentType: metadata.contentType,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get file metadata: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get file content as Buffer (for small files < 50MB)
   * @param objectName - Object name in storage
   * @returns File buffer
   */
  async getFileAsBuffer(objectName: string): Promise<Buffer> {
    try {
      this.logger.log(`Fetching file as buffer: ${objectName}`);
      const buffer = await this.storageProvider.getObjectAsBuffer(objectName);
      this.logger.log(
        `Successfully fetched file as buffer: ${objectName} (${buffer.length} bytes)`,
      );
      return buffer;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get file as buffer: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get file content as Readable stream (for large files >= 50MB)
   * @param objectName - Object name in storage
   * @returns Readable stream
   */
  async getFileAsStream(objectName: string): Promise<Readable> {
    try {
      this.logger.log(`Fetching file as stream: ${objectName}`);
      const stream = await this.storageProvider.getObjectAsStream(objectName);
      this.logger.log(`Successfully fetched file as stream: ${objectName}`);
      return stream;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get file as stream: ${errorMessage}`);
      throw error;
    }
  }
}
