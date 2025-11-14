/**
 * Metadata Enricher Service
 * Based on specs from docs/plans/parse-stage.md - Section: ĐC-3: Metadata Enrichment
 *
 * Enriches documents with comprehensive metadata
 */

import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { createHash } from 'crypto';

/**
 * Original file metadata for enrichment
 */
export interface OriginalFileMetadata {
  fileId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadedBy?: string;
  uploadedAt?: Date;
}

/**
 * Metadata Enricher Service
 */
@Injectable()
export class MetadataEnricherService {
  private readonly logger = new Logger(MetadataEnricherService.name);

  /**
   * Enrich documents with comprehensive metadata
   *
   * @param documents - Documents to enrich
   * @param fileMetadata - Original file metadata
   * @returns Enriched documents
   */
  enrichDocuments(
    documents: Document[],
    fileMetadata: OriginalFileMetadata,
  ): Document[] {
    this.logger.log(`Enriching ${documents.length} documents with metadata`);

    return documents.map((doc, index) =>
      this.enrichDocument(doc, index, fileMetadata),
    );
  }

  /**
   * Enrich a single document
   *
   * @param doc - Document to enrich
   * @param index - Document index
   * @param fileMetadata - Original file metadata
   * @returns Enriched document
   */
  private enrichDocument(
    doc: Document,
    index: number,
    fileMetadata: OriginalFileMetadata,
  ): Document {
    // Calculate content statistics
    const wordCount = this.countWords(doc.pageContent);
    const characterCount = doc.pageContent.length;
    const lineCount = doc.pageContent.split('\n').length;

    // Generate unique document ID
    const documentId = this.generateDocumentId(fileMetadata.fileId, index);

    // Generate content hash for deduplication
    const contentHash = this.generateContentHash(doc.pageContent);

    return {
      ...doc,
      metadata: {
        ...doc.metadata,

        // File metadata
        fileId: fileMetadata.fileId,
        filename: fileMetadata.filename,
        fileSize: fileMetadata.fileSize,
        fileMimeType: fileMetadata.mimeType,

        // User metadata (if available)
        ...(fileMetadata.uploadedBy && {
          uploadedBy: fileMetadata.uploadedBy,
        }),
        ...(fileMetadata.uploadedAt && {
          uploadedAt: fileMetadata.uploadedAt,
        }),

        // Document-specific metadata
        documentIndex: index,
        documentId,
        contentHash,

        // Content statistics
        wordCount,
        characterCount,
        lineCount,

        // Timestamps
        parsedAt: new Date(),
      },
    };
  }

  /**
   * Generate unique document ID
   * Format: {fileId}_doc_{index}
   *
   * @param fileId - File identifier
   * @param documentIndex - Document index
   * @returns Document ID
   */
  generateDocumentId(fileId: string, documentIndex: number): string {
    return `${fileId}_doc_${documentIndex}`;
  }

  /**
   * Generate content hash for deduplication
   * Uses SHA256 hash of content
   *
   * @param content - Content to hash
   * @returns Content hash (hex string)
   */
  generateContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Count words in text
   *
   * @param text - Text to count words in
   * @returns Word count
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter((word) => word.length > 0).length;
  }

  /**
   * Extract basic entity mentions (simple pattern-based)
   * Note: Advanced entity extraction should be done in Enrich stage
   *
   * @param content - Content to analyze
   * @returns Array of potential entity mentions
   */
  extractBasicEntities(content: string): string[] {
    // Simple capitalized word pattern
    // This is very basic - real entity extraction happens in Enrich stage
    const pattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const matches = content.match(pattern) || [];

    // Deduplicate and return
    return Array.from(new Set(matches));
  }

  /**
   * Add custom metadata to documents
   *
   * @param documents - Documents to enhance
   * @param customMetadata - Custom metadata to add
   * @returns Documents with custom metadata
   */
  addCustomMetadata(
    documents: Document[],
    customMetadata: Record<string, unknown>,
  ): Document[] {
    return documents.map((doc) => ({
      ...doc,
      metadata: {
        ...doc.metadata,
        ...customMetadata,
      },
    }));
  }
}
