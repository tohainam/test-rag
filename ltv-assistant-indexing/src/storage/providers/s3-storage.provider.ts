import {
  S3Client,
  HeadBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import type {
  StorageProvider,
  StorageConfig,
  FileMetadata,
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
      forcePathStyle: config.forcePathStyle,
    });

    this.logger.log(
      `S3StorageProvider initialized with bucket: ${this.bucket}`,
    );
  }

  async ensureBucket(): Promise<void> {
    try {
      // Read-only validation - just check if bucket exists
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        }),
      );
      this.logger.log(
        `Bucket ${this.bucket} validated (read-only access confirmed)`,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFound') {
        throw new StorageError(
          `Bucket ${this.bucket} not found. This service only reads from existing buckets. ` +
            `Please ensure the bucket is created by the Datasource Service.`,
        );
      } else {
        this.logger.error(`Failed to validate bucket ${this.bucket}`, error);
        throw new StorageError(
          `Failed to validate bucket: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
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

  async getObjectAsBuffer(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new FileNotFoundError(key);
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body;

      // Type guard for Readable check
      if (
        !(
          stream &&
          typeof stream === 'object' &&
          Symbol.asyncIterator in stream
        )
      ) {
        throw new StorageError(
          `Expected Readable stream from S3, got ${typeof response.Body}`,
        );
      }

      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(chunk));
      }

      const buffer = Buffer.concat(chunks);
      this.logger.log(
        `Successfully fetched file as buffer: ${key} (${buffer.length} bytes)`,
      );

      return buffer;
    } catch (error) {
      this.logger.error(`Failed to get object as buffer ${key}`, error);

      if (error instanceof NotFound) {
        throw new FileNotFoundError(key);
      }

      if (error instanceof Error && error.name === 'Forbidden') {
        throw new AccessDeniedError(key);
      }

      throw new StorageError(
        `Failed to get object as buffer: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async getObjectAsStream(key: string): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new FileNotFoundError(key);
      }

      // Validate it's a Readable stream
      if (!(response.Body instanceof Readable)) {
        throw new StorageError(
          `Expected Readable stream from S3, got ${typeof response.Body}`,
        );
      }

      this.logger.log(`Successfully fetched file as stream: ${key}`);

      return response.Body;
    } catch (error) {
      this.logger.error(`Failed to get object as stream ${key}`, error);

      if (error instanceof NotFound) {
        throw new FileNotFoundError(key);
      }

      if (error instanceof Error && error.name === 'Forbidden') {
        throw new AccessDeniedError(key);
      }

      throw new StorageError(
        `Failed to get object as stream: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
