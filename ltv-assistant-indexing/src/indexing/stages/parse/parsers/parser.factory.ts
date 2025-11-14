/**
 * Parser Factory
 * Based on specs from docs/plans/parse-stage.md - Section: ĐC-1: Parser Selection
 *
 * Selects appropriate parser based on MIME type and file extension
 */

import { Logger } from '@nestjs/common';
import * as path from 'path';
import {
  ParserType,
  MIME_TO_PARSER,
  EXTENSION_TO_PARSER,
} from '../types/parse-types';
import { UnsupportedFileTypeError } from '../errors/parse-errors';

/**
 * Parser selection input
 */
export interface ParserSelectionInput {
  fileId: string;
  filePath: string;
  mimeType: string | null;
  filename: string;
}

/**
 * Parser selection output
 */
export interface ParserSelectionOutput {
  parserType: ParserType;
  filename: string;
  extension: string;
}

/**
 * ParserFactory - Selects appropriate parser for file type
 */
export class ParserFactory {
  private readonly logger = new Logger(ParserFactory.name);

  /**
   * Select parser based on MIME type and file extension
   * @param input - Parser selection input
   * @returns Parser selection output
   * @throws UnsupportedFileTypeError if file type is not supported
   */
  selectParser(input: ParserSelectionInput): ParserSelectionOutput {
    this.logger.log(
      `Selecting parser for file: ${input.filename}, MIME: ${input.mimeType}`,
    );

    // Step 1: Try MIME type mapping first
    let parserType: ParserType | null = null;

    if (input.mimeType) {
      parserType = MIME_TO_PARSER[input.mimeType] || null;

      if (parserType) {
        this.logger.log(
          `Parser selected from MIME type: ${parserType} (${input.mimeType})`,
        );
      }
    }

    // Step 2: Fallback to extension mapping if MIME didn't match
    const extension = path.extname(input.filename).toLowerCase();

    if (!parserType && extension) {
      parserType = EXTENSION_TO_PARSER[extension] || null;

      if (parserType) {
        this.logger.log(
          `Parser selected from extension: ${parserType} (${extension})`,
        );
      }
    }

    // Step 3: Throw error if no parser found
    if (!parserType) {
      this.logger.error(
        `Unsupported file type - MIME: ${input.mimeType}, Extension: ${extension}, File: ${input.filename}`,
      );

      throw new UnsupportedFileTypeError(
        input.fileId,
        input.filePath,
        input.mimeType || `extension: ${extension || 'unknown'}`,
      );
    }

    return {
      parserType,
      filename: input.filename,
      extension: extension || '',
    };
  }

  /**
   * Check if a MIME type is supported
   * @param mimeType - MIME type to check
   * @returns True if supported
   */
  isSupported(mimeType: string): boolean {
    return mimeType in MIME_TO_PARSER;
  }

  /**
   * Check if a file extension is supported
   * @param extension - File extension to check (with or without dot)
   * @returns True if supported
   */
  isExtensionSupported(extension: string): boolean {
    const normalizedExt = extension.startsWith('.')
      ? extension.toLowerCase()
      : `.${extension.toLowerCase()}`;
    return normalizedExt in EXTENSION_TO_PARSER;
  }

  /**
   * Get parser type for MIME type
   * @param mimeType - MIME type
   * @returns Parser type or null if not found
   */
  getParserTypeForMime(mimeType: string): ParserType | null {
    return MIME_TO_PARSER[mimeType] || null;
  }

  /**
   * Get parser type for extension
   * @param extension - File extension (with or without dot)
   * @returns Parser type or null if not found
   */
  getParserTypeForExtension(extension: string): ParserType | null {
    const normalizedExt = extension.startsWith('.')
      ? extension.toLowerCase()
      : `.${extension.toLowerCase()}`;
    return EXTENSION_TO_PARSER[normalizedExt] || null;
  }
}
