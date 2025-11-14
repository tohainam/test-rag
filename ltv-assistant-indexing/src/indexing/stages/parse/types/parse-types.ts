/**
 * Parse Stage Type Definitions
 * Based on specs from docs/plans/parse-stage.md
 */

import { Document } from '@langchain/core/documents';

/**
 * Parser types supported by the Parse Stage
 */
export type ParserType = 'pdf' | 'docx' | 'text' | 'code' | 'markdown';

/**
 * Parse result structure
 */
export interface ParseResult {
  documents: Document[];
  metadata: ParseMetadata;
}

/**
 * Parse metadata
 */
export interface ParseMetadata {
  fileId: string;
  filename: string;
  parserType: ParserType;
  documentCount: number;
  totalCharacters: number;
  parseTime: number;
  parsedAt: Date;
}

/**
 * Content statistics
 */
export interface ContentStatistics {
  wordCount: number;
  characterCount: number;
  lineCount: number;
}

/**
 * Language information for code files
 */
export interface LanguageInfo {
  language: string;
  extension: string;
}

/**
 * Supported programming languages
 */
export const SUPPORTED_LANGUAGES: Record<string, string> = {
  '.py': 'python',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript-react',
  '.jsx': 'javascript-react',
  '.java': 'java',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c-header',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
};

/**
 * MIME type to parser type mapping
 */
export const MIME_TO_PARSER: Record<string, ParserType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/msword': 'docx',
  'text/plain': 'text',
  'text/markdown': 'markdown',
  'text/x-python': 'code',
  'text/javascript': 'code',
  'application/javascript': 'code',
  'text/x-typescript': 'code',
  'text/x-java-source': 'code',
  'text/x-c': 'code',
  'text/x-c++src': 'code',
};

/**
 * File extension to parser type mapping (fallback)
 */
export const EXTENSION_TO_PARSER: Record<string, ParserType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.doc': 'docx',
  '.txt': 'text',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.py': 'code',
  '.js': 'code',
  '.ts': 'code',
  '.tsx': 'code',
  '.jsx': 'code',
  '.java': 'code',
  '.cpp': 'code',
  '.c': 'code',
  '.h': 'code',
  '.go': 'code',
  '.rs': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.cs': 'code',
};
