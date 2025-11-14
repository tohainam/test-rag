/**
 * Load Stage Orchestrator
 * Based on specs from docs/plans/load-stage.md
 *
 * The Load Stage is the first of 7 stages in the indexing pipeline:
 * Load → Parse → Structure → Chunk → Enrich → Embed → Persist
 *
 * Responsibilities:
 * - Fetch files from MinIO
 * - Detect and validate MIME types
 * - Handle large files via streaming
 * - Verify file integrity
 * - Enrich metadata
 */

import { Injectable, Logger } from '@nestjs/common';
import { LoadInputDto, LoadOutputDto, LoadMetadataDto } from './dto';
import { StorageService } from '../../../storage/storage.service';
import { MimeDetectionService } from '../../../storage/services/mime-detection.service';
import { StreamingService, LoadResult } from './services/streaming.service';
import { IntegrityService } from '../../../storage/services/integrity.service';
import { InvalidInputError } from './errors/load-errors';

@Injectable()
export class LoadStage {
  private readonly logger = new Logger(LoadStage.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly mimeDetectionService: MimeDetectionService,
    private readonly streamingService: StreamingService,
    private readonly integrityService: IntegrityService,
  ) {}

  /**
   * Execute Load Stage
   * Based on load-stage.md - Section: Luồng dữ liệu
   *
   * @param input - Load stage input
   * @returns Load stage output
   */
  async execute(input: LoadInputDto): Promise<LoadOutputDto> {
    const startTime = Date.now();
    this.logger.log(
      `=== Load Stage Start === File: ${input.filename} (${input.fileId})`,
    );

    try {
      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Get file metadata from Storage
      const fileMetadata = await this.storageService.getFileMetadata(
        input.filePath,
      );

      this.logger.log(
        `File metadata - Size: ${fileMetadata.size} bytes, ` +
          `Type: ${fileMetadata.contentType || 'unknown'}`,
      );

      // Step 3: Decide load method (buffer vs stream)
      const decision = this.streamingService.decideLoadMethod(
        fileMetadata.size,
      );

      this.logger.log(
        `Load method decision: ${decision.method} (${decision.reason})`,
      );

      // Step 4: Load file based on decision
      const loadResult = await this.loadFile(input, decision.method);

      // Step 5: Detect MIME type
      const firstChunk = await this.getFirstChunk(loadResult);
      const mimeResult = await this.mimeDetectionService.detect(
        firstChunk,
        input.filename,
        input.mimeType ?? undefined,
      );

      this.logger.log(
        `MIME detection - Type: ${mimeResult.mimeType}, ` +
          `Extension: ${mimeResult.extension ?? 'unknown'}, ` +
          `Detected from magic bytes: ${mimeResult.detectedFromMagicBytes}`,
      );

      // Step 6: Validate file type is supported
      if (!this.mimeDetectionService.isSupported(mimeResult.mimeType)) {
        throw new Error(`Unsupported file type: ${mimeResult.mimeType}`);
      }

      // Step 7: Calculate checksum (integrity verification)
      let checksumMd5: string;
      if (loadResult.type === 'buffer') {
        checksumMd5 = this.integrityService.calculateMd5(loadResult.buffer);
      } else {
        // Read file and calculate checksum
        const fs = await import('fs/promises');
        const fileBuffer = await fs.readFile(loadResult.tempPath);
        checksumMd5 = this.integrityService.calculateMd5(fileBuffer);
      }

      this.logger.log(`File checksum (MD5): ${checksumMd5}`);

      // Step 8: Build metadata
      const metadata: LoadMetadataDto = {
        fileId: input.fileId,
        filename: input.filename,
        size: loadResult.size,
        mimeType: mimeResult.mimeType,
        checksumMd5,
        retrievedAt: new Date(),
        loadMethod: decision.method,
      };

      // Step 9: Build output
      const output: LoadOutputDto =
        loadResult.type === 'buffer'
          ? {
              buffer: loadResult.buffer,
              metadata,
            }
          : {
              streamPath: loadResult.tempPath,
              metadata,
            };

      const duration = Date.now() - startTime;
      this.logger.log(
        `=== Load Stage Complete === Duration: ${duration}ms, ` +
          `Method: ${decision.method}, Size: ${loadResult.size} bytes`,
      );

      return output;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `=== Load Stage Failed === Duration: ${duration}ms, ` +
          `File: ${input.filename}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Validate input parameters
   * Based on load-stage.md - Section: Xác thực & Bảo mật
   *
   * @param input - Input to validate
   * @throws InvalidInputError if validation fails
   */
  private validateInput(input: LoadInputDto): void {
    if (!input.fileId || input.fileId.trim().length === 0) {
      throw new InvalidInputError('fileId is required and cannot be empty');
    }

    if (!input.documentId || input.documentId.trim().length === 0) {
      throw new InvalidInputError('documentId is required and cannot be empty');
    }

    if (!input.filePath || input.filePath.trim().length === 0) {
      throw new InvalidInputError('filePath is required and cannot be empty');
    }

    if (!input.filename || input.filename.trim().length === 0) {
      throw new InvalidInputError('filename is required and cannot be empty');
    }

    // Validate file path for path traversal
    if (input.filePath.includes('../') || input.filePath.includes('..\\')) {
      throw new InvalidInputError(
        'Invalid filePath: path traversal sequences not allowed',
      );
    }

    // Validate file path length (1-1024 characters)
    if (input.filePath.length > 1024) {
      throw new InvalidInputError('filePath exceeds maximum length of 1024');
    }

    // Validate file path pattern - allow Unicode, whitespace, and common filename characters
    // Disallow only dangerous characters: null bytes, control characters
    const hasInvalidChars = [...input.filePath].some((char) => {
      const code = char.charCodeAt(0);
      // Reject null bytes and control characters (0x00-0x1F, 0x7F)
      return code === 0 || (code >= 1 && code <= 31) || code === 127;
    });

    if (hasInvalidChars) {
      throw new InvalidInputError(
        'Invalid filePath: contains null bytes or control characters',
      );
    }
  }

  /**
   * Load file using buffer or stream method
   * @param input - Input parameters
   * @param method - Load method (buffer or stream)
   * @returns Load result
   */
  private async loadFile(
    input: LoadInputDto,
    method: 'buffer' | 'stream',
  ): Promise<LoadResult> {
    if (method === 'buffer') {
      const buffer = await this.storageService.getFileAsBuffer(input.filePath);
      return this.streamingService.loadFileWithBuffer(buffer);
    } else {
      const stream = await this.storageService.getFileAsStream(input.filePath);
      return await this.streamingService.loadFileWithStream(
        stream,
        input.fileId,
      );
    }
  }

  /**
   * Get first 4KB chunk for MIME detection
   * @param loadResult - Load result
   * @returns First 4KB buffer
   */
  private async getFirstChunk(loadResult: LoadResult): Promise<Buffer> {
    if (loadResult.type === 'buffer') {
      // Return first 4KB from buffer
      return loadResult.buffer.subarray(0, 4096);
    } else {
      // Read first 4KB from temp file
      const fs = await import('fs/promises');
      const fileHandle = await fs.open(loadResult.tempPath, 'r');
      const buffer = Buffer.alloc(4096);
      await fileHandle.read(buffer, 0, 4096, 0);
      await fileHandle.close();
      return buffer;
    }
  }
}
