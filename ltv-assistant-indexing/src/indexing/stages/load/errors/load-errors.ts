/**
 * Load Stage Errors
 * Based on specs from docs/plans/load-stage.md - Section: Chiến lược xử lý lỗi
 */

/**
 * Base class for all Load Stage errors
 */
export abstract class LoadStageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Permanent errors - do not retry
 */
export class FileNotFoundError extends LoadStageError {
  constructor(filePath: string) {
    super(`File not found at path: ${filePath}`, 'LOAD_FILE_NOT_FOUND', false);
  }
}

export class AccessDeniedError extends LoadStageError {
  constructor(filePath: string) {
    super(`Access denied to file: ${filePath}`, 'LOAD_ACCESS_DENIED', false);
  }
}

export class UnsupportedFileTypeError extends LoadStageError {
  constructor(mimeType: string) {
    super(`Unsupported file type: ${mimeType}`, 'LOAD_UNSUPPORTED_TYPE', false);
  }
}

export class ChecksumMismatchError extends LoadStageError {
  constructor(expected: string, actual: string) {
    super(
      `Checksum mismatch - expected: ${expected}, actual: ${actual}`,
      'LOAD_CHECKSUM_MISMATCH',
      false,
    );
  }
}

export class InvalidInputError extends LoadStageError {
  constructor(message: string) {
    super(message, 'LOAD_INVALID_INPUT', false);
  }
}

/**
 * Temporary errors - retry with backoff
 */
export class NetworkTimeoutError extends LoadStageError {
  constructor(message: string) {
    super(message, 'LOAD_NETWORK_TIMEOUT', true);
  }
}

export class ServiceUnavailableError extends LoadStageError {
  constructor(service: string) {
    super(`Service unavailable: ${service}`, 'LOAD_SERVICE_UNAVAILABLE', true);
  }
}

export class RateLimitExceededError extends LoadStageError {
  constructor() {
    super('Rate limit exceeded', 'LOAD_RATE_LIMITED', true);
  }
}

/**
 * Resource errors - retry with adaptation
 */
export class OutOfMemoryError extends LoadStageError {
  constructor(fileSize: number) {
    super(
      `Out of memory while loading file of size ${fileSize} bytes`,
      'LOAD_OUT_OF_MEMORY',
      true,
    );
  }
}

export class DiskFullError extends LoadStageError {
  constructor(path: string) {
    super(`Disk full at path: ${path}`, 'LOAD_DISK_FULL', true);
  }
}
