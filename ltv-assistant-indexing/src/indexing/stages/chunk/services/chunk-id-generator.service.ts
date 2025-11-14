import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Chunk ID Generator Service
 * Generates unique IDs using content hash + timestamp + counter
 * to prevent collisions from similar content
 */
@Injectable()
export class ChunkIdGeneratorService {
  private readonly HASH_LENGTH = 12;
  private readonly PARENT_PREFIX = 'par';
  private readonly CHILD_PREFIX = 'chi';
  private counter = 0;

  /**
   * Generate chunk ID for parent chunk
   * @param content - Chunk content
   * @returns Unique chunk ID (content hash + timestamp + counter)
   */
  generateParentId(content: string): string {
    const normalized = this.normalizeContent(content);
    const uniqueContent = `${normalized}_${Date.now()}_${this.counter++}`;
    const hash = this.generateHash(uniqueContent);
    return `${this.PARENT_PREFIX}_${hash}`;
  }

  /**
   * Generate chunk ID for child chunk
   * @param content - Chunk content
   * @returns Unique chunk ID (content hash + timestamp + counter)
   */
  generateChildId(content: string): string {
    const normalized = this.normalizeContent(content);
    const uniqueContent = `${normalized}_${Date.now()}_${this.counter++}`;
    const hash = this.generateHash(uniqueContent);
    return `${this.CHILD_PREFIX}_${hash}`;
  }

  /**
   * Normalize content for consistent hashing
   * @param content - Raw content
   * @returns Normalized content
   */
  private normalizeContent(content: string): string {
    return content
      .trim() // Remove leading/trailing whitespace
      .replace(/\s+/g, ' ') // Normalize whitespace
      .toLowerCase() // Case-insensitive

      .replace(/[^\w\s]/g, ''); // Remove special characters
  }

  /**
   * Generate MD5 hash of content
   * @param content - Normalized content
   * @returns Hash string (first 12 characters)
   */
  private generateHash(content: string): string {
    return crypto
      .createHash('md5')
      .update(content)
      .digest('hex')
      .slice(0, this.HASH_LENGTH);
  }

  /**
   * Generate lineage ID
   * @param childChunkId - Child chunk ID
   * @param parentChunkId - Parent chunk ID
   * @returns Lineage ID
   */
  generateLineageId(childChunkId: string, parentChunkId: string): string {
    const combined = `${childChunkId}_${parentChunkId}`;
    const hash = this.generateHash(combined);
    return `lin_${hash}`;
  }
}
