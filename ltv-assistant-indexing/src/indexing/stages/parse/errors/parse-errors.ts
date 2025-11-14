/**
 * Parse Stage Error Definitions
 * Based on specs from docs/plans/parse-stage.md - Section: Chiến lược xử lý lỗi
 */

/**
 * Parse error types classification
 */
export enum ParseErrorType {
  // Permanent errors (no retry)
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  CORRUPTED_FILE = 'CORRUPTED_FILE',
  PASSWORD_PROTECTED = 'PASSWORD_PROTECTED',
  EMPTY_FILE = 'EMPTY_FILE',

  // Temporary errors (retry with backoff)
  TIMEOUT = 'TIMEOUT',
  MEMORY_EXCEEDED = 'MEMORY_EXCEEDED',
  ENCODING_ERROR = 'ENCODING_ERROR',

  // Partial success
  PARTIAL_SUCCESS = 'PARTIAL_SUCCESS',
}

/**
 * Base parse error class
 */
export class ParseError extends Error {
  constructor(
    public readonly type: ParseErrorType,
    public readonly fileId: string,
    public readonly filePath: string,
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'ParseError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Unsupported file format error (permanent)
 */
export class UnsupportedFileTypeError extends ParseError {
  constructor(fileId: string, filePath: string, mimeType: string) {
    super(
      ParseErrorType.UNSUPPORTED_FORMAT,
      fileId,
      filePath,
      `Unsupported file type: ${mimeType}. Please use PDF, DOCX, TXT, MD, or supported code files.`,
    );
    this.name = 'UnsupportedFileTypeError';
  }
}

/**
 * Corrupted file error (permanent)
 */
export class CorruptedFileError extends ParseError {
  constructor(
    fileId: string,
    filePath: string,
    message: string,
    originalError?: Error,
  ) {
    super(
      ParseErrorType.CORRUPTED_FILE,
      fileId,
      filePath,
      `File is corrupted or invalid: ${message}`,
      originalError,
    );
    this.name = 'CorruptedFileError';
  }
}

/**
 * Password-protected PDF error (permanent)
 */
export class PasswordProtectedPDFError extends ParseError {
  constructor(fileId: string, filePath: string) {
    super(
      ParseErrorType.PASSWORD_PROTECTED,
      fileId,
      filePath,
      'PDF file is password-protected. Please provide an unencrypted version.',
    );
    this.name = 'PasswordProtectedPDFError';
  }
}

/**
 * Empty file error (permanent)
 */
export class EmptyFileError extends ParseError {
  constructor(fileId: string, filePath: string) {
    super(
      ParseErrorType.EMPTY_FILE,
      fileId,
      filePath,
      'No content extracted from file. The file appears to be empty.',
    );
    this.name = 'EmptyFileError';
  }
}

/**
 * Parse timeout error (temporary)
 */
export class ParseTimeoutError extends ParseError {
  constructor(
    fileId: string,
    filePath: string,
    timeoutMs: number,
    originalError?: Error,
  ) {
    super(
      ParseErrorType.TIMEOUT,
      fileId,
      filePath,
      `Parser timeout after ${timeoutMs}ms. File may be too large or complex.`,
      originalError,
    );
    this.name = 'ParseTimeoutError';
  }
}

/**
 * Memory exceeded error (temporary)
 */
export class MemoryExceededError extends ParseError {
  constructor(
    fileId: string,
    filePath: string,
    message: string,
    originalError?: Error,
  ) {
    super(
      ParseErrorType.MEMORY_EXCEEDED,
      fileId,
      filePath,
      `Out of memory while parsing: ${message}`,
      originalError,
    );
    this.name = 'MemoryExceededError';
  }
}

/**
 * Encoding error (temporary)
 */
export class EncodingError extends ParseError {
  constructor(
    fileId: string,
    filePath: string,
    detectedEncoding: string,
    originalError?: Error,
  ) {
    super(
      ParseErrorType.ENCODING_ERROR,
      fileId,
      filePath,
      `Failed to decode file with encoding: ${detectedEncoding}`,
      originalError,
    );
    this.name = 'EncodingError';
  }
}

/**
 * Partial parse success
 */
export interface PartialParseResult {
  success: boolean;
  documents: unknown[];
  warnings: string[];
  failedPages?: number[];
  successRate: number;
}
