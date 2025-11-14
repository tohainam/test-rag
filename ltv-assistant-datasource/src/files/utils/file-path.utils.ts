/**
 * Utility functions for file path generation
 * Supports both legacy and new path formats
 */

/**
 * Generate date-based file path following new format
 * Format: documents/{DDMMYYYY}/{randomPrefix}_{filename}
 * Example: documents/21012026/3f9a7b8c_report.pdf
 */
export function generateDateBasedFilePath(filename: string): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const dateFolder = `${day}${month}${year}`; // DDMMYYYY

  // Generate random prefix (8 chars alphanumeric)
  const randomPrefix = Math.random().toString(36).substring(2, 10);

  return `${dateFolder}/${randomPrefix}_${filename}`;
}

/**
 * Check if file path uses legacy format
 * Legacy format: {documentId}/{fileId}/{filename}
 * New format: documents/{DDMMYYYY}/{randomPrefix}_{filename}
 */
export function isLegacyFilePath(filePath: string): boolean {
  return !filePath.startsWith('documents/');
}

/**
 * Extract filename from file path (handles both formats)
 */
export function extractFilename(filePath: string): string {
  const parts = filePath.split('/');
  const lastPart = parts[parts.length - 1];

  // For new format, remove random prefix
  if (!isLegacyFilePath(filePath)) {
    const underscoreIndex = lastPart.indexOf('_');
    if (underscoreIndex !== -1) {
      return lastPart.substring(underscoreIndex + 1);
    }
  }

  return lastPart;
}

/**
 * Get bucket name for the file path
 */
export function getBucketName(filePath: string): string {
  if (isLegacyFilePath(filePath)) {
    return 'ltv-assistant'; // Legacy bucket name
  }
  return 'ltv-assistant'; // Same bucket, different prefix
}
