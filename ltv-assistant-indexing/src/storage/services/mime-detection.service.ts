import { Injectable, Logger } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import * as mime from 'mime-types';
import { ALLOWED_MIME_TYPES } from '../../common/constants/allowed-mime-types';

export interface MimeDetectionResult {
  mimeType: string;
  extension: string | null;
  detectedFromMagicBytes: boolean;
}

@Injectable()
export class MimeDetectionService {
  private readonly logger = new Logger(MimeDetectionService.name);

  /**
   * Supported MIME types - restricted to system-wide allowed types
   * Source: ALLOWED_MIME_TYPES constant (single source of truth)
   * Aligned with:
   * - Client-side validation (CMS FileUploadZone)
   * - Server-side upload validation (Datasource Service DTOs)
   * - Server-side indexing validation (Indexing Service)
   */
  private readonly SUPPORTED_TYPES = new Set<string>(ALLOWED_MIME_TYPES);

  /**
   * Detect MIME type from file buffer (magic bytes)
   * @param buffer - File buffer (first 4KB is usually sufficient)
   * @returns Detected MIME type or null
   */
  async detectFromBuffer(buffer: Buffer): Promise<MimeDetectionResult | null> {
    try {
      const fileTypeResult = await fileTypeFromBuffer(buffer);

      if (fileTypeResult) {
        return {
          mimeType: fileTypeResult.mime,
          extension: fileTypeResult.ext,
          detectedFromMagicBytes: true,
        };
      }

      return null;
    } catch (error) {
      this.logger.warn('Failed to detect MIME type from buffer', error);
      return null;
    }
  }

  /**
   * Detect MIME type from file extension
   * @param filename - File name with extension
   * @returns Detected MIME type or null
   */
  detectFromExtension(filename: string): MimeDetectionResult | null {
    const mimeType = mime.lookup(filename);

    if (mimeType) {
      const extension = mime.extension(mimeType);
      return {
        mimeType,
        extension: extension || null,
        detectedFromMagicBytes: false,
      };
    }

    return null;
  }

  /**
   * Check if MIME type is supported
   * @param mimeType - MIME type to check
   * @returns true if supported
   */
  isSupported(mimeType: string): boolean {
    return this.SUPPORTED_TYPES.has(mimeType);
  }

  /**
   * Comprehensive MIME type detection
   * Tries magic bytes first, then falls back to extension
   * @param buffer - Optional file buffer for magic byte detection
   * @param filename - File name for extension-based detection
   * @param reportedMimeType - Optional MIME type reported by client
   * @returns Best detected MIME type
   */
  async detect(
    buffer: Buffer | null,
    filename: string,
    reportedMimeType?: string,
  ): Promise<MimeDetectionResult> {
    // Try magic bytes first (most reliable)
    if (buffer) {
      const magicBytesResult = await this.detectFromBuffer(buffer);
      if (magicBytesResult && this.isSupported(magicBytesResult.mimeType)) {
        this.logger.log(
          `Detected MIME type from magic bytes: ${magicBytesResult.mimeType}`,
        );
        return magicBytesResult;
      }
    }

    // Fall back to extension
    const extensionResult = this.detectFromExtension(filename);
    if (extensionResult && this.isSupported(extensionResult.mimeType)) {
      this.logger.log(
        `Detected MIME type from extension: ${extensionResult.mimeType}`,
      );
      return extensionResult;
    }

    // Fall back to reported MIME type if available and supported
    if (reportedMimeType && this.isSupported(reportedMimeType)) {
      this.logger.log(`Using reported MIME type: ${reportedMimeType}`);
      const extension = mime.extension(reportedMimeType);
      return {
        mimeType: reportedMimeType,
        extension: extension || null,
        detectedFromMagicBytes: false,
      };
    }

    // Default to application/octet-stream for unknown types
    this.logger.warn(
      `Could not detect supported MIME type for ${filename}, using default`,
    );
    return {
      mimeType: 'application/octet-stream',
      extension: null,
      detectedFromMagicBytes: false,
    };
  }

  /**
   * Validate that detected MIME type matches expected type
   * @param detectedMimeType - MIME type detected from file
   * @param expectedMimeType - MIME type expected/reported
   * @returns true if types match or are compatible
   */
  validate(detectedMimeType: string, expectedMimeType: string): boolean {
    // Exact match
    if (detectedMimeType === expectedMimeType) {
      return true;
    }

    // Handle text/* types - many text files may not have magic bytes
    if (
      detectedMimeType.startsWith('text/') &&
      expectedMimeType.startsWith('text/')
    ) {
      return true;
    }

    // Handle application/octet-stream (generic binary)
    if (
      detectedMimeType === 'application/octet-stream' ||
      expectedMimeType === 'application/octet-stream'
    ) {
      return true;
    }

    return false;
  }
}
