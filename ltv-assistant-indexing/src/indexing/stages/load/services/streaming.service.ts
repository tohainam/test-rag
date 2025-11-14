/**
 * Streaming Service for Large Files
 * Based on specs from docs/plans/load-stage.md - Section: YN-3
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { createWriteStream, promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DiskFullError } from '../errors/load-errors';

export interface StreamConfig {
  chunkSize: number; // Default: 64KB
  highWaterMark: number; // Default: 16 chunks
  tempDir: string; // Default: /tmp/indexing/{jobId}
}

export interface StreamResult {
  type: 'stream';
  tempPath: string;
  size: number;
  cleanup: () => Promise<void>;
}

export interface BufferResult {
  type: 'buffer';
  buffer: Buffer;
  size: number;
}

export type LoadResult = StreamResult | BufferResult;

/**
 * Decision logic for loading method
 * Based on load-stage.md - Section: YN-3
 */
export interface LoadDecision {
  method: 'buffer' | 'stream';
  reason: string;
}

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);
  private readonly streamingThreshold: number;
  private readonly chunkSize: number;
  private readonly tempDir: string;

  constructor(private readonly configService: ConfigService) {
    // Helper to coerce config values to finite numbers
    const toNumber = (value: unknown, defaultValue: number): number => {
      const n = Number(value);
      return Number.isFinite(n) ? n : defaultValue;
    };

    // Streaming threshold: 50MB by default (force numeric, clamp to >= 1MB)
    const thresholdMbRaw = toNumber(
      this.configService.get('LOAD_STREAMING_THRESHOLD'),
      50,
    );
    const thresholdMb = Math.max(1, Math.floor(thresholdMbRaw));
    this.streamingThreshold = thresholdMb * 1024 * 1024;

    // Chunk size: 64KB by default
    const chunkSizeRaw = toNumber(
      this.configService.get('LOAD_CHUNK_SIZE'),
      65536,
    );
    this.chunkSize = Math.max(1024, Math.floor(chunkSizeRaw)); // at least 1KB

    // Temp directory
    const baseTempDir = this.configService.get<string>(
      'LOAD_TEMP_DIR',
      '/tmp/indexing',
    );
    this.tempDir = baseTempDir;

    this.logger.log(
      `Streaming service initialized - Threshold: ${this.streamingThreshold / 1024 / 1024}MB, ` +
        `Chunk Size: ${this.chunkSize}B, Temp Dir: ${this.tempDir}`,
    );
  }

  /**
   * Decide whether to use buffering or streaming
   * Based on load-stage.md - Section: YN-3
   *
   * @param fileSize - File size in bytes
   * @param availableMemory - Available memory in bytes (optional)
   * @returns Load decision
   */
  decideLoadMethod(fileSize: number, availableMemory?: number): LoadDecision {
    // Hard threshold: Files >50MB must stream
    if (fileSize > this.streamingThreshold) {
      return {
        method: 'stream',
        reason: `File size (${fileSize} bytes) exceeds ${this.streamingThreshold / 1024 / 1024}MB threshold`,
      };
    }

    // Check available memory: Need at least 2x file size
    if (availableMemory !== undefined && availableMemory < fileSize * 2) {
      return {
        method: 'stream',
        reason: 'Insufficient memory available',
      };
    }

    // Small file, sufficient memory -> buffer into RAM
    return {
      method: 'buffer',
      reason: 'File size small enough for buffering',
    };
  }

  /**
   * Load file with streaming to temporary file
   * Based on load-stage.md - Section: YN-3
   *
   * @param stream - Readable stream from MinIO
   * @param jobId - Job ID for temp directory
   * @returns Stream result with cleanup function
   */
  async loadFileWithStream(
    stream: Readable,
    jobId: string,
  ): Promise<StreamResult> {
    const jobTempDir = path.join(this.tempDir, jobId);
    const tempFile = path.join(jobTempDir, `${uuidv4()}.tmp`);

    // Create temp directory
    try {
      await fs.mkdir(jobTempDir, { recursive: true });
    } catch (error) {
      this.logger.error(
        `Failed to create temp directory: ${jobTempDir}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DiskFullError(jobTempDir);
    }

    // Create write stream with backpressure
    const writeStream = createWriteStream(tempFile, {
      highWaterMark: 16 * this.chunkSize,
    });

    // Track progress
    let bytesReceived = 0;
    stream.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
      this.logger.log(`Downloaded ${bytesReceived} bytes`);
    });

    // Cleanup function
    const cleanup = async (): Promise<void> => {
      try {
        await fs.unlink(tempFile);
        this.logger.log(`Cleaned up temp file: ${tempFile}`);
      } catch (error) {
        this.logger.warn(
          `Failed to cleanup temp file: ${tempFile}`,
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    // Stream to file
    return new Promise((resolve, reject) => {
      stream
        .pipe(writeStream)
        .on('finish', () => {
          this.logger.log(
            `Successfully streamed file to ${tempFile} (${bytesReceived} bytes)`,
          );
          resolve({
            type: 'stream',
            tempPath: tempFile,
            size: bytesReceived,
            cleanup,
          });
        })
        .on('error', (err: Error) => {
          cleanup().catch((cleanupErr) => {
            this.logger.warn('Cleanup during error failed', cleanupErr);
          });
          this.logger.error(`Streaming failed: ${err.message}`, err.stack);
          reject(err);
        });
    });
  }

  /**
   * Load file with buffering into memory
   * Based on load-stage.md - Section: YN-3
   *
   * @param buffer - Buffer from MinIO
   * @returns Buffer result
   */
  loadFileWithBuffer(buffer: Buffer): BufferResult {
    this.logger.log(`Loaded file into buffer (${buffer.length} bytes)`);

    return {
      type: 'buffer',
      buffer,
      size: buffer.length,
    };
  }

  /**
   * Cleanup old temporary files
   * Based on load-stage.md - Section: YN-3
   *
   * @param maxAgeHours - Maximum age in hours (default: 24)
   */
  async cleanupOldTempFiles(maxAgeHours = 24): Promise<void> {
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;

    try {
      const dirs = await fs.readdir(this.tempDir);

      for (const dir of dirs) {
        const dirPath = path.join(this.tempDir, dir);
        try {
          const stat = await fs.stat(dirPath);
          if (stat.mtime.getTime() < cutoff) {
            await fs.rm(dirPath, { recursive: true, force: true });
            this.logger.log(`Auto-cleaned old temp dir: ${dir}`);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to stat/remove temp dir ${dir}`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to read temp directory: ${this.tempDir}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Cleanup all temp files for a specific job
   * @param jobId - Job ID
   */
  async cleanupJobTempFiles(jobId: string): Promise<void> {
    const jobTempDir = path.join(this.tempDir, jobId);

    try {
      await fs.rm(jobTempDir, { recursive: true, force: true });
      this.logger.log(`Cleaned up temp directory: ${jobTempDir}`);
    } catch (error) {
      this.logger.error(
        `Cleanup failed for job ${jobId}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Get streaming threshold
   */
  getStreamingThreshold(): number {
    return this.streamingThreshold;
  }

  /**
   * Get temp directory
   */
  getTempDir(): string {
    return this.tempDir;
  }
}
