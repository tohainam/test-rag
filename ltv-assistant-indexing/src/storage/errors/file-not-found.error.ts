import { StorageError } from './storage.error';

export class FileNotFoundError extends StorageError {
  constructor(key: string) {
    super(`File not found: ${key}`, 'FileNotFound', 404);
    this.name = 'FileNotFoundError';
    Object.setPrototypeOf(this, FileNotFoundError.prototype);
  }
}
