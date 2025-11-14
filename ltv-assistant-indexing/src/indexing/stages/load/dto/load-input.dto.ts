/**
 * Load Stage Input DTO
 * Based on specs from docs/plans/load-stage.md - Section: ĐC-1
 */

export interface LoadInputDto {
  /**
   * UUID file identifier
   */
  fileId: string;

  /**
   * UUID document identifier
   */
  documentId: string;

  /**
   * MinIO path (bucket/key)
   */
  filePath: string;

  /**
   * Original filename with extension
   */
  filename: string;

  /**
   * Reported MIME type from datasource (may be null)
   */
  mimeType: string | null;

  /**
   * Optional bucket override (if not using default)
   */
  bucketName?: string;

  /**
   * Optional presigned URL for direct access
   */
  presignedUrl?: string;
}
