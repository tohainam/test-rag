import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  NotFound,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import type {
  StorageProvider,
  StorageConfig,
  FileMetadata,
  MultipartUploadInit,
  MultipartUploadPart,
  MultipartUploadUrls,
  PresignedUrlOptions,
} from '../interfaces';
import { StorageError, FileNotFoundError, AccessDeniedError } from '../errors';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: StorageConfig) {
    this.bucket = config.bucket;

    // Initialize S3 client with configuration
    this.s3Client = new S3Client({
      endpoint: `${config.useSSL ? 'https' : 'http'}://${config.endpoint}:${config.port}`,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: config.forcePathStyle, // Required for MinIO and other S3-compatible providers
    });

    this.logger.log(
      `S3StorageProvider initialized with bucket: ${this.bucket}`,
    );
  }

  async ensureBucket(): Promise<void> {
    try {
      // Check if bucket exists
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        }),
      );
      this.logger.log(`Bucket ${this.bucket} already exists`);
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFound') {
        // Bucket doesn't exist, create it
        try {
          await this.s3Client.send(
            new CreateBucketCommand({
              Bucket: this.bucket,
            }),
          );
          this.logger.log(`Bucket ${this.bucket} created successfully`);
        } catch (createError) {
          this.logger.error(
            `Failed to create bucket ${this.bucket}`,
            createError,
          );
          throw new StorageError(
            `Failed to create bucket: ${createError instanceof Error ? createError.message : 'Unknown error'}`,
          );
        }
      } else {
        this.logger.error(`Failed to check bucket ${this.bucket}`, error);
        throw new StorageError(
          `Failed to check bucket: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  async generatePresignedUploadUrl(
    key: string,
    options?: PresignedUrlOptions,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: options?.expirySeconds ?? 900, // Default 15 minutes
      });

      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned upload URL for ${key}`,
        error,
      );
      throw new StorageError(
        `Failed to generate presigned upload URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async generatePresignedDownloadUrl(
    key: string,
    options?: PresignedUrlOptions,
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: options?.expirySeconds ?? 900, // Default 15 minutes
      });

      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned download URL for ${key}`,
        error,
      );
      throw new StorageError(
        `Failed to generate presigned download URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async initMultipartUpload(key: string): Promise<MultipartUploadInit> {
    try {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      if (!response.UploadId) {
        throw new StorageError(
          'Failed to initialize multipart upload: No upload ID returned',
        );
      }

      return {
        uploadId: response.UploadId,
        key,
      };
    } catch (error) {
      this.logger.error(
        `Failed to initialize multipart upload for ${key}`,
        error,
      );
      throw new StorageError(
        `Failed to initialize multipart upload: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async generateMultipartUploadUrls(
    key: string,
    uploadId: string,
    partsCount: number,
    options?: PresignedUrlOptions,
  ): Promise<MultipartUploadUrls[]> {
    try {
      const urls: MultipartUploadUrls[] = [];

      for (let partNumber = 1; partNumber <= partsCount; partNumber++) {
        const command = new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        });

        const url = await getSignedUrl(this.s3Client, command, {
          expiresIn: options?.expirySeconds ?? 900, // Default 15 minutes
        });

        urls.push({
          partNumber,
          url,
        });
      }

      return urls;
    } catch (error) {
      this.logger.error(
        `Failed to generate multipart upload URLs for ${key}`,
        error,
      );
      throw new StorageError(
        `Failed to generate multipart upload URLs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: MultipartUploadPart[],
  ): Promise<void> {
    try {
      // Sort parts by part number and format for S3
      const sortedParts = parts
        .sort((a, b) => a.partNumber - b.partNumber)
        .map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        }));

      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: sortedParts,
        },
      });

      await this.s3Client.send(command);
      this.logger.log(`Completed multipart upload for ${key}`);
    } catch (error) {
      this.logger.error(
        `Failed to complete multipart upload for ${key}`,
        error,
      );
      throw new StorageError(
        `Failed to complete multipart upload: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      const command = new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      });

      await this.s3Client.send(command);
      this.logger.log(`Aborted multipart upload for ${key}`);
    } catch (error) {
      this.logger.error(`Failed to abort multipart upload for ${key}`, error);
      throw new StorageError(
        `Failed to abort multipart upload: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Deleted object: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete object ${key}`, error);

      if (error instanceof NotFound) {
        throw new FileNotFoundError(key);
      }

      throw new StorageError(
        `Failed to delete object: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async getMetadata(key: string): Promise<FileMetadata> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType ?? null,
        etag: response.ETag ?? null,
        lastModified: response.LastModified ?? null,
      };
    } catch (error) {
      this.logger.error(`Failed to get metadata for ${key}`, error);

      if (error instanceof NotFound) {
        throw new FileNotFoundError(key);
      }

      if (error instanceof Error && error.name === 'Forbidden') {
        throw new AccessDeniedError(key);
      }

      throw new StorageError(
        `Failed to get metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.getMetadata(key);
      return true;
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}
