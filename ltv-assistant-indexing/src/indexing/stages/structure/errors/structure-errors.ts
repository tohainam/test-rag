/**
 * Structure Stage Error Definitions
 * Based on specs from docs/plans/structure-stage.md
 */

/**
 * Base Structure Error
 */
export class StructureError extends Error {
  constructor(
    public readonly fileId: string,
    public readonly filename: string,
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'StructureError';
  }
}

/**
 * Empty Input Error - Permanent
 * Raised when no parsedDocs provided from Parse Stage
 */
export class EmptyInputError extends StructureError {
  constructor(fileId: string, filename: string) {
    super(
      fileId,
      filename,
      'No parsedDocs provided from Parse Stage. Cannot proceed with structure detection.',
    );
    this.name = 'EmptyInputError';
  }
}

/**
 * No Structure Detected Error - Recoverable (Fallback)
 * Raised when no headings detected, but can continue with flat structure
 */
export class NoStructureDetectedError extends StructureError {
  constructor(fileId: string, filename: string) {
    super(
      fileId,
      filename,
      'No headings detected in document. Falling back to flat structure.',
    );
    this.name = 'NoStructureDetectedError';
  }
}

/**
 * Invalid Hierarchy Error - Recoverable (Auto-correct)
 * Raised when hierarchy is invalid but can be corrected
 */
export class InvalidHierarchyError extends StructureError {
  constructor(fileId: string, filename: string, details: string) {
    super(
      fileId,
      filename,
      `Invalid document hierarchy detected: ${details}. Will attempt auto-correction.`,
    );
    this.name = 'InvalidHierarchyError';
  }
}
