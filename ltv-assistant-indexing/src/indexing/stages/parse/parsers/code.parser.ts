/**
 * Code Parser
 * Based on specs from docs/plans/parse-stage.md - Section: YN-4: Phân tích Code Files
 *
 * Parses source code files with language detection and syntax preservation
 */

import { Injectable, Logger } from '@nestjs/common';
import { TextLoader } from '@langchain/classic/document_loaders/fs/text';
import { Document } from '@langchain/core/documents';
import * as path from 'path';
import { SUPPORTED_LANGUAGES } from '../types/parse-types';
import { UnsupportedFileTypeError } from '../errors/parse-errors';

/**
 * Code Parser Service
 */
@Injectable()
export class CodeParser {
  private readonly logger = new Logger(CodeParser.name);

  /**
   * Parse code file with language detection
   *
   * @param filePath - Path to code file
   * @param fileId - File identifier for error reporting
   * @returns Array of LangChain Document objects (typically one document)
   * @throws UnsupportedFileTypeError if code file extension is not supported
   */
  async parse(filePath: string, fileId: string): Promise<Document[]> {
    const startTime = Date.now();

    this.logger.log(`Parsing code file: ${filePath}`);

    // Detect language from extension
    const extension = path.extname(filePath).toLowerCase();
    const language = SUPPORTED_LANGUAGES[extension];

    if (!language) {
      throw new UnsupportedFileTypeError(
        fileId,
        filePath,
        `Code file extension ${extension} not supported`,
      );
    }

    this.logger.log(`Detected language: ${language} (${extension})`);

    try {
      // Use TextLoader to preserve syntax and indentation
      const loader = new TextLoader(filePath);
      const documents = await loader.load();

      const duration = Date.now() - startTime;

      this.logger.log(
        `Code parsing complete - Duration: ${duration}ms, Language: ${language}`,
      );

      // Enrich with code-specific metadata
      const enrichedDocuments = documents.map((doc, index) => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          documentType: 'code',
          documentIndex: index,
          language,
          extension,
          lineCount: doc.pageContent.split('\n').length,
          characterCount: doc.pageContent.length,
        },
      }));

      return enrichedDocuments;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        `Code parsing failed - Duration: ${duration}ms, File: ${filePath}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  /**
   * Detect programming language from file extension
   *
   * @param filename - Filename or path
   * @returns Language name or null if not recognized
   */
  detectLanguage(filename: string): string | null {
    const extension = path.extname(filename).toLowerCase();
    return SUPPORTED_LANGUAGES[extension] || null;
  }

  /**
   * Check if file extension is supported
   *
   * @param filename - Filename or path
   * @returns True if extension is supported
   */
  isSupported(filename: string): boolean {
    const extension = path.extname(filename).toLowerCase();
    return extension in SUPPORTED_LANGUAGES;
  }

  /**
   * Get all supported extensions
   *
   * @returns Array of supported extensions
   */
  getSupportedExtensions(): string[] {
    return Object.keys(SUPPORTED_LANGUAGES);
  }

  /**
   * Get all supported languages
   *
   * @returns Array of supported language names
   */
  getSupportedLanguages(): string[] {
    return Array.from(new Set(Object.values(SUPPORTED_LANGUAGES)));
  }
}
