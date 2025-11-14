/**
 * Enrich Stage Error Classes
 */

/**
 * Base error for enrich stage
 */
export class EnrichError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrichError';
  }
}

/**
 * Empty chunks error
 */
export class EmptyChunksError extends EnrichError {
  constructor() {
    super('No chunks provided for enrichment');
    this.name = 'EmptyChunksError';
  }
}

/**
 * Content modification error (critical - should never happen)
 */
export class ContentModifiedError extends EnrichError {
  constructor(chunkId: string) {
    super(
      `CRITICAL: Content was modified during enrichment for chunk ${chunkId}`,
    );
    this.name = 'ContentModifiedError';
  }
}

/**
 * Token count mismatch error (critical - should never happen)
 */
export class TokenCountMismatchError extends EnrichError {
  constructor(chunkId: string, original: number, enriched: number) {
    super(
      `CRITICAL: Token count changed during enrichment for chunk ${chunkId}: ` +
        `${original} → ${enriched}`,
    );
    this.name = 'TokenCountMismatchError';
  }
}

/**
 * Partial enrichment error (some chunks failed but not all)
 */
export class PartialEnrichmentError extends EnrichError {
  constructor(
    message: string,
    public readonly failedChunkIds: string[],
    public readonly successRate: number,
  ) {
    super(message);
    this.name = 'PartialEnrichmentError';
  }
}

/**
 * Entity extraction error (non-fatal)
 */
export class EntityExtractionError extends EnrichError {
  constructor(chunkId: string, cause: Error) {
    super(`Entity extraction failed for chunk ${chunkId}: ${cause.message}`);
    this.name = 'EntityExtractionError';
    this.cause = cause;
  }
}

/**
 * Keyword extraction error (non-fatal)
 */
export class KeywordExtractionError extends EnrichError {
  constructor(cause: Error) {
    super(`Keyword extraction failed: ${cause.message}`);
    this.name = 'KeywordExtractionError';
    this.cause = cause;
  }
}

/**
 * LLM enrichment error (non-fatal)
 */
export class LLMEnrichmentError extends EnrichError {
  constructor(operation: string, cause: Error) {
    super(`LLM enrichment failed for ${operation}: ${cause.message}`);
    this.name = 'LLMEnrichmentError';
    this.cause = cause;
  }
}
