/**
 * Load Stage Output DTO
 * Based on specs from docs/plans/load-stage.md - Section: ĐC-1
 */

export interface LoadMetadataDto {
  fileId: string;
  filename: string;
  size: number; // Bytes
  mimeType: string | null; // Detected MIME type
  checksumMd5?: string; // MD5 hash for integrity
  retrievedAt: Date;
  loadMethod: 'buffer' | 'stream'; // Method used for loading
}

export interface LoadOutputDto {
  /**
   * For small files (<50MB) - buffered in memory
   */
  buffer?: Buffer;

  /**
   * For large files (>=50MB) - streamed to temp file
   */
  streamPath?: string;

  /**
   * Metadata about the loaded file
   */
  metadata: LoadMetadataDto;
}
