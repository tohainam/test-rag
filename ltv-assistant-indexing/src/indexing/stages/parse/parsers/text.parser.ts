/**
 * Text Parser
 * Based on specs from docs/plans/parse-stage.md - Section: YN-3: Phân tích Text & Markdown
 *
 * Uses LangChain.js TextLoader with automatic encoding detection
 */

import { Injectable, Logger } from '@nestjs/common';
import { TextLoader } from '@langchain/classic/document_loaders/fs/text';
import { Document } from '@langchain/core/documents';
import * as chardet from 'chardet';
import * as iconv from 'iconv-lite';
import * as fs from 'fs/promises';
import { CorruptedFileError, EncodingError } from '../errors/parse-errors';

/**
 * Text Parser Service
 */
@Injectable()
export class TextParser {
  private readonly logger = new Logger(TextParser.name);

  /**
   * Parse text file with automatic encoding detection
   *
   * @param filePath - Path to text file
   * @param fileId - File identifier for error reporting
   * @returns Array of LangChain Document objects (typically one document)
   * @throws EncodingError if encoding detection/conversion fails
   * @throws CorruptedFileError if file cannot be read
   */
  async parse(filePath: string, fileId: string): Promise<Document[]> {
    const startTime = Date.now();

    this.logger.log(`Parsing text file: ${filePath}`);

    try {
      // Try with LangChain TextLoader first (uses default encoding)
      try {
        const loader = new TextLoader(filePath);
        const documents = await loader.load();

        if (
          documents.length > 0 &&
          documents[0].pageContent.trim().length > 0
        ) {
          const duration = Date.now() - startTime;

          this.logger.log(
            `Text parsing complete (default encoding) - Duration: ${duration}ms`,
          );

          return this.enrichDocuments(documents, 'utf-8', null);
        }
      } catch (defaultError) {
        this.logger.log(
          `Default encoding failed, trying encoding detection: ${defaultError instanceof Error ? defaultError.message : String(defaultError)}`,
        );
      }

      // Fallback: Use encoding detection
      const documentsWithDetection =
        await this.parseWithEncodingDetection(filePath);

      const duration = Date.now() - startTime;

      this.logger.log(
        `Text parsing complete (detected encoding) - Duration: ${duration}ms`,
      );

      return documentsWithDetection;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        `Text parsing failed - Duration: ${duration}ms, File: ${filePath}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (
        error instanceof EncodingError ||
        error instanceof CorruptedFileError
      ) {
        throw error;
      }

      throw new CorruptedFileError(
        fileId,
        filePath,
        'Failed to parse text file',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Parse text file with automatic encoding detection
   *
   * @param filePath - Path to text file
   * @returns Array of Document objects
   */
  private async parseWithEncodingDetection(
    filePath: string,
  ): Promise<Document[]> {
    // Step 1: Read file as buffer
    const buffer = await fs.readFile(filePath);

    // Step 2: Detect encoding
    const detectedEncoding = chardet.detect(buffer);
    const encoding = detectedEncoding || 'utf-8';

    this.logger.log(`Detected encoding: ${encoding} for file: ${filePath}`);

    // Step 3: Decode with detected encoding
    let content: string;
    try {
      content = iconv.decode(buffer, encoding);
    } catch {
      this.logger.warn(
        `Failed to decode with ${encoding}, falling back to UTF-8`,
      );
      content = iconv.decode(buffer, 'utf-8');
    }

    // Step 4: Remove BOM if present
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
      this.logger.log('Removed BOM from content');
    }

    // Step 5: Normalize line endings (CRLF → LF)
    content = content.replace(/\r\n/g, '\n');

    // Step 6: Create Document
    const doc: Document = {
      pageContent: content,
      metadata: {
        source: filePath,
      },
    };

    return this.enrichDocuments([doc], encoding, detectedEncoding);
  }

  /**
   * Enrich documents with metadata
   *
   * @param documents - Documents to enrich
   * @param encoding - Encoding used
   * @param detectedEncoding - Detected encoding (if applicable)
   * @returns Enriched documents
   */
  private enrichDocuments(
    documents: Document[],
    encoding: string,
    detectedEncoding: string | null,
  ): Document[] {
    return documents.map((doc, index) => ({
      ...doc,
      metadata: {
        ...doc.metadata,
        documentType: 'text',
        documentIndex: index,
        encoding,
        detectedEncoding: detectedEncoding || encoding,
        lineCount: doc.pageContent.split('\n').length,
        characterCount: doc.pageContent.length,
        wordCount: this.countWords(doc.pageContent),
      },
    }));
  }

  /**
   * Count words in text
   * @param text - Text to count words in
   * @returns Word count
   */
  private countWords(text: string): number {
    const words = text.split(/\s+/).filter((word) => word.length > 0);
    return words.length;
  }

  /**
   * Validate text file is not binary
   * @param filePath - Path to text file
   * @returns True if file appears to be text
   */
  async validateIsText(filePath: string): Promise<boolean> {
    try {
      const buffer = await fs.readFile(filePath);

      // Check first 8KB for null bytes (indicator of binary file)
      const sampleSize = Math.min(buffer.length, 8192);
      const sample = buffer.subarray(0, sampleSize);

      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0) {
          this.logger.warn(
            `File contains null bytes, likely binary: ${filePath}`,
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to validate text file: ${filePath}`,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }
}
