import {
  FileMetadata,
  MultipartUploadInit,
  MultipartUploadPart,
  MultipartUploadUrls,
} from './storage-metadata.interface';
import { PresignedUrlOptions } from './storage-config.interface';

export interface StorageProvider {
  /**
   * Ensure bucket exists, create if not
   */
  ensureBucket(): Promise<void>;

  /**
   * Generate presigned URL for uploading a file
   */
  generatePresignedUploadUrl(
    key: string,
    options?: PresignedUrlOptions,
  ): Promise<string>;

  /**
   * Generate presigned URL for downloading a file
   */
  generatePresignedDownloadUrl(
    key: string,
    options?: PresignedUrlOptions,
  ): Promise<string>;

  /**
   * Initialize multipart upload
   */
  initMultipartUpload(key: string): Promise<MultipartUploadInit>;

  /**
   * Generate presigned URLs for multipart upload parts
   */
  generateMultipartUploadUrls(
    key: string,
    uploadId: string,
    partsCount: number,
    options?: PresignedUrlOptions,
  ): Promise<MultipartUploadUrls[]>;

  /**
   * Complete multipart upload
   */
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: MultipartUploadPart[],
  ): Promise<void>;

  /**
   * Abort multipart upload
   */
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;

  /**
   * Delete an object
   */
  deleteObject(key: string): Promise<void>;

  /**
   * Get file metadata
   */
  getMetadata(key: string): Promise<FileMetadata>;

  /**
   * Check if object exists
   */
  objectExists(key: string): Promise<boolean>;
}
