/**
 * Chunk Stage Error Classes
 * Defines error types for chunking operations
 */

/**
 * Base error for all chunk stage errors
 */
export class ChunkError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'ChunkError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Permanent Errors (Do NOT retry)
 */

export class EmptySectionsError extends ChunkError {
  constructor(message: string = 'No sections provided from Structure Stage') {
    super(message, 'CHUNK_EMPTY_SECTIONS', false);
    this.name = 'EmptySectionsError';
  }
}

export class InvalidBoundariesError extends ChunkError {
  constructor(message: string = 'Boundary data is invalid or malformed') {
    super(message, 'CHUNK_INVALID_BOUNDARIES', false);
    this.name = 'InvalidBoundariesError';
  }
}

export class OrphanChildrenError extends ChunkError {
  constructor(
    message: string,
    public readonly orphanIds: string[],
  ) {
    super(message, 'CHUNK_ORPHAN_CHILDREN', false);
    this.name = 'OrphanChildrenError';
  }
}

export class DuplicateIdsError extends ChunkError {
  constructor(
    message: string,
    public readonly duplicateIds: string[],
  ) {
    super(message, 'CHUNK_DUPLICATE_IDS', false);
    this.name = 'DuplicateIdsError';
  }
}

/**
 * Temporary Errors (Retry with adaptation)
 */

export class TokenCountExceededError extends ChunkError {
  constructor(
    message: string,
    public readonly actualTokens: number,
    public readonly maxTokens: number,
  ) {
    super(message, 'CHUNK_TOKEN_EXCEEDED', true);
    this.name = 'TokenCountExceededError';
  }
}

export class InvalidSplitError extends ChunkError {
  constructor(message: string = 'Split created invalid chunks') {
    super(message, 'CHUNK_INVALID_SPLIT', true);
    this.name = 'InvalidSplitError';
  }
}

export class TokenizerError extends ChunkError {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message, 'CHUNK_TOKENIZER_ERROR', true);
    this.name = 'TokenizerError';
  }
}

/**
 * Partial Success (Recoverable)
 */

export class PartialChunkingError extends ChunkError {
  constructor(
    message: string,
    public readonly failedSections: string[],
    public readonly successRate: number,
  ) {
    super(message, 'CHUNK_PARTIAL_SUCCESS', false);
    this.name = 'PartialChunkingError';
  }
}

export class IncompleteLineageError extends ChunkError {
  constructor(
    message: string,
    public readonly missingParents: string[],
  ) {
    super(message, 'CHUNK_INCOMPLETE_LINEAGE', false);
    this.name = 'IncompleteLineageError';
  }
}
