/**
 * Persist Stage Custom Errors
 * Based on specs from docs/plans/persist-stage.md
 */

export class PersistStageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersistStageError';
  }
}

export class MySQLPersistenceError extends PersistStageError {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(`MySQL persistence failed: ${message}`);
    this.name = 'MySQLPersistenceError';
  }
}

export class QdrantPersistenceError extends PersistStageError {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(`Qdrant persistence failed: ${message}`);
    this.name = 'QdrantPersistenceError';
  }
}

export class RollbackError extends PersistStageError {
  constructor(
    message: string,
    public readonly errors: string[],
  ) {
    super(`Rollback failed: ${message}. Errors: ${errors.join('; ')}`);
    this.name = 'RollbackError';
  }
}

export class InvalidInputError extends PersistStageError {
  constructor(message: string) {
    super(`Invalid input: ${message}`);
    this.name = 'InvalidInputError';
  }
}
