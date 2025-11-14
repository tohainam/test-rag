/**
 * DOCX Parser
 * Based on specs from docs/plans/parse-stage.md - Section: YN-2: Phân tích DOCX
 *
 * Uses LangChain.js DocxLoader to extract text from DOCX files
 */

import { Injectable, Logger } from '@nestjs/common';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { Document } from '@langchain/core/documents';
import { CorruptedFileError } from '../errors/parse-errors';

/**
 * DOCX Parser Service
 */
@Injectable()
export class DocxParser {
  private readonly logger = new Logger(DocxParser.name);

  /**
   * Parse DOCX file using DocxLoader
   *
   * @param filePath - Path to DOCX file
   * @param fileId - File identifier for error reporting
   * @returns Array of LangChain Document objects (typically one document for entire file)
   * @throws CorruptedFileError if DOCX is corrupted or invalid
   */
  async parse(filePath: string, fileId: string): Promise<Document[]> {
    const startTime = Date.now();

    this.logger.log(`Parsing DOCX file: ${filePath}`);

    try {
      // Create DocxLoader
      const loader = new DocxLoader(filePath);

      // Load and parse DOCX
      // DocxLoader returns single Document with full content
      const documents = await loader.load();

      const duration = Date.now() - startTime;

      this.logger.log(
        `DOCX parsing complete - Duration: ${duration}ms, ` +
          `Documents: ${documents.length}`,
      );

      // Enrich metadata with document type and statistics
      const enrichedDocuments = documents.map((doc, index) => {
        const wordCount = this.countWords(doc.pageContent);
        const lineCount = doc.pageContent.split('\n').length;
        const characterCount = doc.pageContent.length;

        return {
          ...doc,
          metadata: {
            ...doc.metadata,
            documentType: 'docx',
            documentIndex: index,
            wordCount,
            characterCount,
            lineCount,
          },
        };
      });

      return enrichedDocuments;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        `DOCX parsing failed - Duration: ${duration}ms, File: ${filePath}`,
        error instanceof Error ? error.stack : String(error),
      );

      // All DOCX parsing errors are treated as corrupted file errors
      throw new CorruptedFileError(
        fileId,
        filePath,
        'Failed to parse DOCX file. File may be corrupted or in unsupported format.',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Count words in text
   * @param text - Text to count words in
   * @returns Word count
   */
  private countWords(text: string): number {
    // Split by whitespace and filter out empty strings
    const words = text.split(/\s+/).filter((word) => word.length > 0);
    return words.length;
  }

  /**
   * Validate DOCX file size before parsing
   * @param filePath - Path to DOCX file
   * @param maxSizeMB - Maximum allowed file size in MB
   * @returns True if file size is within limit
   */
  async validateFileSize(
    filePath: string,
    maxSizeMB: number = 50,
  ): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const stats = await fs.stat(filePath);
      const fileSizeMB = stats.size / (1024 * 1024);

      if (fileSizeMB > maxSizeMB) {
        this.logger.warn(
          `DOCX file size (${fileSizeMB.toFixed(2)}MB) exceeds limit (${maxSizeMB}MB): ${filePath}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to check DOCX file size: ${filePath}`,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }
}
