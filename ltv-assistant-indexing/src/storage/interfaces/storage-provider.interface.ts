import { Readable } from 'stream';
import { FileMetadata } from './storage-metadata.interface';

/**
 * StorageProvider interface for Indexing Service
 * This service only READS files from storage, never writes/uploads/deletes
 * All write operations are handled by the Datasource Service
 */
export interface StorageProvider {
  /**
   * Ensure bucket exists (read-only validation)
   */
  ensureBucket(): Promise<void>;

  /**
   * Get file metadata (size, content type, etc.)
   */
  getMetadata(key: string): Promise<FileMetadata>;

  /**
   * Check if object exists in storage
   */
  objectExists(key: string): Promise<boolean>;

  /**
   * Get file content as Buffer (for small files < 50MB)
   */
  getObjectAsBuffer(key: string): Promise<Buffer>;

  /**
   * Get file content as Readable stream (for large files >= 50MB)
   */
  getObjectAsStream(key: string): Promise<Readable>;
}
