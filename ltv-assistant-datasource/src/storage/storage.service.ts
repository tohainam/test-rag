import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import type { StorageProvider } from './interfaces';
import { STORAGE_PROVIDER } from './storage.provider.factory';

// Maintain backward compatibility with the old Part interface
export interface Part {
  partNumber: number;
  etag: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {
    this.logger.log('StorageService initialized');
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.storageProvider.ensureBucket();
      this.logger.log('Storage bucket initialized successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initialize storage bucket: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Generate presigned URL for single file upload
   * @param objectName - Object name in storage (path/filename)
   * @param expirySeconds - URL expiration time in seconds
   */
  async generatePresignedPutUrl(
    objectName: string,
    expirySeconds: number = 900, // 15 minutes default
  ): Promise<string> {
    try {
      const url = await this.storageProvider.generatePresignedUploadUrl(
        objectName,
        { expirySeconds },
      );
      return url;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to generate presigned PUT URL: ${errorMessage}`,
      );
      throw error;
    }
  }

  /**
   * Generate presigned URL for file download
   * @param objectName - Object name in storage
   * @param expirySeconds - URL expiration time in seconds
   */
  async generatePresignedGetUrl(
    objectName: string,
    expirySeconds: number = 900, // 15 minutes default
  ): Promise<string> {
    try {
      const url = await this.storageProvider.generatePresignedDownloadUrl(
        objectName,
        { expirySeconds },
      );
      return url;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to generate presigned GET URL: ${errorMessage}`,
      );
      throw error;
    }
  }

  /**
   * Initialize multipart upload
   * @param objectName - Object name in storage
   * @returns uploadId
   */
  async initMultipartUpload(objectName: string): Promise<string> {
    try {
      const result = await this.storageProvider.initMultipartUpload(objectName);
      this.logger.log(
        `Initiated multipart upload: ${result.uploadId} for ${objectName}`,
      );
      return result.uploadId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to init multipart upload: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Generate presigned URLs for multipart upload parts
   * @param objectName - Object name in storage
   * @param uploadId - Upload ID from initMultipartUpload
   * @param partsCount - Number of parts
   * @param expirySeconds - URL expiration time
   * @returns Array of {partNumber, url}
   */
  async generatePresignedUrlsForParts(
    objectName: string,
    uploadId: string,
    partsCount: number,
    expirySeconds: number = 900, // 15 minutes default
  ): Promise<{ partNumber: number; url: string }[]> {
    try {
      const urls = await this.storageProvider.generateMultipartUploadUrls(
        objectName,
        uploadId,
        partsCount,
        { expirySeconds },
      );
      this.logger.log(
        `Generated ${partsCount} presigned URLs for multipart upload`,
      );
      return urls;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to generate multipart presigned URLs: ${errorMessage}`,
      );
      throw error;
    }
  }

  /**
   * Complete multipart upload
   * @param objectName - Object name in storage
   * @param uploadId - Upload ID
   * @param parts - Array of {partNumber, etag}
   */
  async completeMultipartUpload(
    objectName: string,
    uploadId: string,
    parts: Part[],
  ): Promise<void> {
    try {
      await this.storageProvider.completeMultipartUpload(
        objectName,
        uploadId,
        parts,
      );
      this.logger.log(`Completed multipart upload for ${objectName}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to complete multipart upload: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Abort multipart upload
   * @param objectName - Object name in storage
   * @param uploadId - Upload ID
   */
  async abortMultipartUpload(
    objectName: string,
    uploadId: string,
  ): Promise<void> {
    try {
      await this.storageProvider.abortMultipartUpload(objectName, uploadId);
      this.logger.log(
        `Aborted multipart upload: ${uploadId} for ${objectName}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to abort multipart upload: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Delete file from storage
   * @param objectName - Object name in storage
   */
  async deleteFile(objectName: string): Promise<void> {
    try {
      await this.storageProvider.deleteObject(objectName);
      this.logger.log(`Deleted file: ${objectName}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to delete file: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Check if file exists
   * @param objectName - Object name in storage
   */
  async fileExists(objectName: string): Promise<boolean> {
    try {
      return await this.storageProvider.objectExists(objectName);
    } catch (error) {
      // If it's a known error, return false
      // Otherwise, rethrow
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error checking file existence: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get file metadata
   * @param objectName - Object name in storage
   */
  async getFileMetadata(objectName: string): Promise<{
    size: number;
    lastModified: Date | null;
    etag: string | null;
    contentType: string | null;
  }> {
    try {
      const metadata = await this.storageProvider.getMetadata(objectName);

      // Return in the same format as the old MinIO service for backward compatibility
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
}
