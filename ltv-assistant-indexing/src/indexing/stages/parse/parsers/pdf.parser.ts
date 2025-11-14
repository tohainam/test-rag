/**
 * PDF Parser
 * Based on specs from docs/plans/parse-stage.md - Section: YN-1: Phân tích PDF
 *
 * Uses LangChain.js PDFLoader to extract text from PDF files
 */

import { Injectable, Logger } from '@nestjs/common';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { Document } from '@langchain/core/documents';
import {
  PasswordProtectedPDFError,
  CorruptedFileError,
} from '../errors/parse-errors';

/**
 * PDF Parser Options
 */
export interface PDFParserOptions {
  /**
   * Split PDF into separate documents per page
   * Default: true
   */
  splitPages?: boolean;

  /**
   * Separator between parsed items
   * Default: ' '
   */
  parsedItemSeparator?: string;
}

/**
 * PDF Parser Service
 */
@Injectable()
export class PdfParser {
  private readonly logger = new Logger(PdfParser.name);

  /**
   * Parse PDF file using PDFLoader
   *
   * @param filePath - Path to PDF file
   * @param fileId - File identifier for error reporting
   * @param options - Parser options
   * @returns Array of LangChain Document objects
   * @throws PasswordProtectedPDFError if PDF is password-protected
   * @throws CorruptedFileError if PDF is corrupted
   */
  async parse(
    filePath: string,
    fileId: string,
    options?: PDFParserOptions,
  ): Promise<Document[]> {
    const startTime = Date.now();

    this.logger.log(`Parsing PDF file: ${filePath}`);

    try {
      // Create PDFLoader with options
      const loader = new PDFLoader(filePath, {
        splitPages: options?.splitPages ?? true,
        parsedItemSeparator: options?.parsedItemSeparator ?? ' ',
      });

      // Load and parse PDF
      const documents = await loader.load();

      // Filter out empty pages
      const nonEmptyDocuments = documents.filter((doc) => {
        const trimmedContent = doc.pageContent.trim();
        return trimmedContent.length > 0;
      });

      const duration = Date.now() - startTime;

      this.logger.log(
        `PDF parsing complete - Duration: ${duration}ms, ` +
          `Pages: ${documents.length}, ` +
          `Non-empty pages: ${nonEmptyDocuments.length}`,
      );

      // Enrich metadata with document type
      const enrichedDocuments = nonEmptyDocuments.map((doc, index) => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          documentType: 'pdf',
          documentIndex: index,
          characterCount: doc.pageContent.length,
          lineCount: doc.pageContent.split('\n').length,
        },
      }));

      return enrichedDocuments;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        `PDF parsing failed - Duration: ${duration}ms, File: ${filePath}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Classify error type
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        // Password-protected PDF
        if (
          errorMessage.includes('password') ||
          errorMessage.includes('encrypted')
        ) {
          throw new PasswordProtectedPDFError(fileId, filePath);
        }

        // Corrupted PDF
        if (
          errorMessage.includes('invalid pdf') ||
          errorMessage.includes('corrupt') ||
          errorMessage.includes('damaged')
        ) {
          throw new CorruptedFileError(
            fileId,
            filePath,
            'PDF file is corrupted or invalid',
            error,
          );
        }
      }

      // Generic parsing error
      throw new CorruptedFileError(
        fileId,
        filePath,
        'Failed to parse PDF file',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get PDF metadata without full parsing
   * Useful for validation before heavy processing
   *
   * @param filePath - Path to PDF file
   * @returns Basic PDF metadata
   */
  async getMetadata(
    filePath: string,
  ): Promise<{ totalPages: number; version: string | null }> {
    try {
      const loader = new PDFLoader(filePath, {
        splitPages: true,
      });

      const documents = await loader.load();

      // Extract metadata from first document
      const firstDoc = documents[0];
      const pdfMetadata = firstDoc?.metadata?.pdf as
        | { version?: string }
        | undefined;

      return {
        totalPages: documents.length,
        version: pdfMetadata?.version || null,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to extract PDF metadata from ${filePath}`,
        error instanceof Error ? error.message : String(error),
      );

      return {
        totalPages: 0,
        version: null,
      };
    }
  }
}
