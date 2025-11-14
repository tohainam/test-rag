/**
 * Parse Stage Input DTO
 * Based on specs from docs/plans/parse-stage.md - Section: Điểm tích hợp
 */

export interface ParseInputDto {
  /**
   * Unique file identifier
   */
  fileId: string;

  /**
   * Document identifier
   */
  documentId: string;

  /**
   * File path (from Load stage)
   * Can be either buffer path or stream path
   */
  filePath: string;

  /**
   * Original filename
   */
  filename: string;

  /**
   * MIME type detected in Load stage
   * Null if detection failed
   */
  mimeType: string | null;

  /**
   * File buffer (for small files loaded in memory)
   * Optional - only present if Load stage used buffer method
   */
  buffer?: Buffer;

  /**
   * Stream path (for large files written to disk)
   * Optional - only present if Load stage used stream method
   */
  streamPath?: string;

  /**
   * File size in bytes
   */
  fileSize: number;
}
