/**
 * Allowed MIME types for file indexing
 * This is the single source of truth for supported file types across the entire system
 *
 * These types are enforced at:
 * 1. Client-side (CMS FileUploadZone)
 * 2. Server-side upload validation (Datasource Service DTOs)
 * 3. Server-side indexing validation (Indexing Service MimeDetectionService)
 *
 * IMPORTANT: This must be kept in sync with:
 * - ltv-assistant-datasource/src/files/constants/allowed-mime-types.ts
 * - ltv-assistant-cms/src/features/documents/ui/FileUploadZone.tsx
 */

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * Check if a MIME type is allowed for indexing
 */
export function isAllowedMimeType(
  mimeType: string,
): mimeType is AllowedMimeType {
  return ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType);
}

/**
 * Get human-readable description of allowed file types
 */
export function getAllowedFileTypesDescription(): string {
  return 'PDF, Word documents (.doc, .docx), plain text (.txt), and Markdown (.md)';
}
