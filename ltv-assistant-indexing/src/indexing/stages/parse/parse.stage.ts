/**
 * Parse Stage Orchestrator
 * Based on specs from docs/plans/parse-stage.md
 *
 * The Parse Stage is the second of 7 stages in the indexing pipeline:
 * Load → Parse → Structure → Chunk → Enrich → Embed → Persist
 *
 * Responsibilities:
 * - Select appropriate parser based on MIME type/extension
 * - Parse files using LangChain.js Document Loaders
 * - Normalize content (line endings, encoding, whitespace)
 * - Enrich with metadata (file info, statistics, timestamps)
 * - Handle errors gracefully (permanent vs temporary)
 */

import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { ParseInputDto, ParseOutputDto } from './dto';
import { ParserFactory } from './parsers/parser.factory';
import { PdfParser } from './parsers/pdf.parser';
import { DocxParser } from './parsers/docx.parser';
import { TextParser } from './parsers/text.parser';
import { CodeParser } from './parsers/code.parser';
import { ContentNormalizerService } from './services/content-normalizer.service';
import {
  MetadataEnricherService,
  OriginalFileMetadata,
} from './services/metadata-enricher.service';
import {
  ParseError,
  ParseErrorType,
  EmptyFileError,
  ParseTimeoutError,
} from './errors/parse-errors';
import { ParserType } from './types/parse-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Parse Stage Service
 */
@Injectable()
export class ParseStage {
  private readonly logger = new Logger(ParseStage.name);

  // Default timeout: 5 minutes
  private readonly DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

  constructor(
    private readonly parserFactory: ParserFactory,
    private readonly pdfParser: PdfParser,
    private readonly docxParser: DocxParser,
    private readonly textParser: TextParser,
    private readonly codeParser: CodeParser,
    private readonly contentNormalizer: ContentNormalizerService,
    private readonly metadataEnricher: MetadataEnricherService,
  ) {}

  /**
   * Execute Parse Stage
   *
   * @param input - Parse stage input
   * @returns Parse stage output
   * @throws ParseError if parsing fails
   */
  async execute(input: ParseInputDto): Promise<ParseOutputDto> {
    const startTime = Date.now();

    this.logger.log(
      `=== Parse Stage Start === File: ${input.filename} (${input.fileId})`,
    );

    let cleanup: (() => Promise<void>) | undefined;

    try {
      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Determine actual file path (buffer or stream)
      const filePathResult = await this.getActualFilePath(input);
      const actualFilePath = filePathResult.filePath;
      cleanup = filePathResult.cleanup;

      // Step 3: Select parser based on MIME type/extension
      const parserSelection = this.parserFactory.selectParser({
        fileId: input.fileId,
        filePath: actualFilePath,
        mimeType: input.mimeType,
        filename: input.filename,
      });

      this.logger.log(
        `Parser selected: ${parserSelection.parserType} for file: ${input.filename}`,
      );

      // Step 4: Parse file with timeout protection
      const documents = await this.safeParseFile(
        actualFilePath,
        input.fileId,
        parserSelection.parserType,
      );

      // Step 5: Validate documents (not empty)
      if (!documents || documents.length === 0) {
        throw new EmptyFileError(input.fileId, actualFilePath);
      }

      this.logger.log(
        `Parsed ${documents.length} document(s) from file: ${input.filename}`,
      );

      // Step 6: Normalize content
      const normalizedDocuments =
        this.contentNormalizer.normalizeDocuments(documents);

      this.logger.log('Content normalization complete');

      // Step 7: Enrich with metadata
      const fileMetadata: OriginalFileMetadata = {
        fileId: input.fileId,
        filename: input.filename,
        fileSize: input.fileSize,
        mimeType: input.mimeType || 'unknown',
      };

      const enrichedDocuments = this.metadataEnricher.enrichDocuments(
        normalizedDocuments,
        fileMetadata,
      );

      this.logger.log('Metadata enrichment complete');

      // Step 8: Calculate parse metadata
      const totalCharacters = enrichedDocuments.reduce(
        (sum, doc) => sum + doc.pageContent.length,
        0,
      );

      const parseTime = Date.now() - startTime;

      const output: ParseOutputDto = {
        parsedDocs: enrichedDocuments,
        parseMetadata: {
          fileId: input.fileId,
          filename: input.filename,
          parserType: parserSelection.parserType,
          documentCount: enrichedDocuments.length,
          totalCharacters,
          parseTime,
          parsedAt: new Date(),
        },
      };

      this.logger.log(
        `=== Parse Stage Complete === Duration: ${parseTime}ms, ` +
          `Documents: ${enrichedDocuments.length}, ` +
          `Characters: ${totalCharacters}`,
      );

      return output;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        `=== Parse Stage Failed === Duration: ${duration}ms, ` +
          `File: ${input.filename}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    } finally {
      // Clean up temp file if created
      if (cleanup) {
        await cleanup();
      }
    }
  }

  /**
   * Validate input parameters
   *
   * @param input - Input to validate
   * @throws Error if validation fails
   */
  private validateInput(input: ParseInputDto): void {
    if (!input.fileId || input.fileId.trim().length === 0) {
      throw new Error('fileId is required and cannot be empty');
    }

    if (!input.documentId || input.documentId.trim().length === 0) {
      throw new Error('documentId is required and cannot be empty');
    }

    if (!input.filename || input.filename.trim().length === 0) {
      throw new Error('filename is required and cannot be empty');
    }

    if (!input.buffer && !input.streamPath) {
      throw new Error('Either buffer or streamPath must be provided');
    }
  }

  /**
   * Get actual file path for parsing
   * Handles both buffer and stream scenarios
   *
   * @param input - Parse input
   * @returns Actual file path and cleanup function
   */
  private async getActualFilePath(
    input: ParseInputDto,
  ): Promise<{ filePath: string; cleanup?: () => Promise<void> }> {
    // If streamPath is available, use it directly
    if (input.streamPath) {
      return { filePath: input.streamPath };
    }

    // If buffer is available, write to temp file
    if (input.buffer) {
      const tempDir = path.join(os.tmpdir(), 'parse-stage');
      await fs.mkdir(tempDir, { recursive: true });

      // Create temp file with original extension
      const ext = path.extname(input.filename);
      const tempFilePath = path.join(tempDir, `${input.fileId}${ext}`);

      this.logger.log(
        `Writing buffer to temp file for parsing: ${tempFilePath}`,
      );

      await fs.writeFile(tempFilePath, input.buffer);

      // Return path and cleanup function
      return {
        filePath: tempFilePath,
        cleanup: async () => {
          try {
            await fs.unlink(tempFilePath);
            this.logger.log(`Cleaned up temp file: ${tempFilePath}`);
          } catch (error) {
            this.logger.warn(
              `Failed to clean up temp file: ${tempFilePath}`,
              error instanceof Error ? error.message : String(error),
            );
          }
        },
      };
    }

    // Fallback to filePath (should not happen in normal flow)
    throw new Error(
      'Neither buffer nor streamPath provided for parsing. This should not happen.',
    );
  }

  /**
   * Parse file with timeout protection
   *
   * @param filePath - Path to file
   * @param fileId - File identifier
   * @param parserType - Parser type to use
   * @returns Parsed documents
   * @throws ParseError if parsing fails
   */
  private async safeParseFile(
    filePath: string,
    fileId: string,
    parserType: ParserType,
  ): Promise<Document[]> {
    const timeoutMs = this.DEFAULT_TIMEOUT_MS;

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Parse timeout'));
        }, timeoutMs);
      });

      // Create parse promise
      const parsePromise = this.parseFile(filePath, fileId, parserType);

      // Race between parse and timeout
      const documents = await Promise.race([parsePromise, timeoutPromise]);

      return documents;
    } catch (error) {
      // Classify error
      if (error instanceof Error && error.message.includes('Parse timeout')) {
        throw new ParseTimeoutError(fileId, filePath, timeoutMs, error);
      }

      // Re-throw if already a ParseError
      if (error instanceof ParseError) {
        throw error;
      }

      // Wrap other errors
      throw error;
    }
  }

  /**
   * Parse file using appropriate parser
   *
   * @param filePath - Path to file
   * @param fileId - File identifier
   * @param parserType - Parser type
   * @returns Parsed documents
   */
  private async parseFile(
    filePath: string,
    fileId: string,
    parserType: ParserType,
  ): Promise<Document[]> {
    switch (parserType) {
      case 'pdf':
        return await this.pdfParser.parse(filePath, fileId);

      case 'docx':
        return await this.docxParser.parse(filePath, fileId);

      case 'text':
      case 'markdown':
        return await this.textParser.parse(filePath, fileId);

      case 'code':
        return await this.codeParser.parse(filePath, fileId);

      default: {
        const exhaustiveCheck: never = parserType;
        throw new Error(`Unknown parser type: ${String(exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Classify parse error type
   *
   * @param error - Error to classify
   * @returns Error type
   */
  private classifyError(error: Error): ParseErrorType {
    const message = error.message.toLowerCase();

    if (message.includes('timeout')) {
      return ParseErrorType.TIMEOUT;
    }

    if (message.includes('memory') || message.includes('heap')) {
      return ParseErrorType.MEMORY_EXCEEDED;
    }

    if (message.includes('encoding')) {
      return ParseErrorType.ENCODING_ERROR;
    }

    if (message.includes('password') || message.includes('encrypted')) {
      return ParseErrorType.PASSWORD_PROTECTED;
    }

    if (message.includes('corrupt') || message.includes('invalid')) {
      return ParseErrorType.CORRUPTED_FILE;
    }

    if (message.includes('empty')) {
      return ParseErrorType.EMPTY_FILE;
    }

    if (message.includes('unsupported')) {
      return ParseErrorType.UNSUPPORTED_FORMAT;
    }

    // Default to corrupted file
    return ParseErrorType.CORRUPTED_FILE;
  }
}
