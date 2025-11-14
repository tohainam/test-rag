import { StorageError } from './storage.error';

export class AccessDeniedError extends StorageError {
  constructor(key: string) {
    super(`Access denied to file: ${key}`, 'AccessDenied', 403);
    this.name = 'AccessDeniedError';
    Object.setPrototypeOf(this, AccessDeniedError.prototype);
  }
}
