import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface ChecksumResult {
  md5: string;
  sha256: string;
}

@Injectable()
export class IntegrityService {
  private readonly logger = new Logger(IntegrityService.name);

  /**
   * Calculate checksums for a buffer
   * @param buffer - File buffer
   * @returns MD5 and SHA256 checksums
   */
  calculateChecksums(buffer: Buffer): ChecksumResult {
    const md5 = createHash('md5').update(buffer).digest('hex');
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    return { md5, sha256 };
  }

  /**
   * Calculate MD5 checksum
   * @param buffer - File buffer
   * @returns MD5 checksum
   */
  calculateMd5(buffer: Buffer): string {
    return createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Calculate SHA256 checksum
   * @param buffer - File buffer
   * @returns SHA256 checksum
   */
  calculateSha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Verify checksums match
   * @param buffer - File buffer
   * @param expectedMd5 - Expected MD5 checksum
   * @param expectedSha256 - Expected SHA256 checksum
   * @returns true if checksums match
   */
  verify(
    buffer: Buffer,
    expectedMd5?: string,
    expectedSha256?: string,
  ): boolean {
    if (!expectedMd5 && !expectedSha256) {
      this.logger.warn('No checksums provided for verification');
      return true; // No verification needed
    }

    const calculated = this.calculateChecksums(buffer);

    if (expectedMd5 && calculated.md5 !== expectedMd5.toLowerCase()) {
      this.logger.error(
        `MD5 checksum mismatch. Expected: ${expectedMd5}, Got: ${calculated.md5}`,
      );
      return false;
    }

    if (expectedSha256 && calculated.sha256 !== expectedSha256.toLowerCase()) {
      this.logger.error(
        `SHA256 checksum mismatch. Expected: ${expectedSha256}, Got: ${calculated.sha256}`,
      );
      return false;
    }

    return true;
  }

  /**
   * Calculate ETag (similar to S3 ETag for single-part uploads)
   * S3 ETag is MD5 for single-part uploads, but different for multipart
   * @param buffer - File buffer
   * @returns ETag value
   */
  calculateETag(buffer: Buffer): string {
    return `"${this.calculateMd5(buffer)}"`;
  }

  /**
   * Verify ETag matches
   * @param buffer - File buffer
   * @param etag - Expected ETag
   * @returns true if ETag matches
   */
  verifyETag(buffer: Buffer, etag: string): boolean {
    const calculated = this.calculateETag(buffer);
    const normalizedEtag = etag.replace(/"/g, '');
    const normalizedCalculated = calculated.replace(/"/g, '');

    if (normalizedCalculated !== normalizedEtag) {
      this.logger.error(`ETag mismatch. Expected: ${etag}, Got: ${calculated}`);
      return false;
    }

    return true;
  }
}
