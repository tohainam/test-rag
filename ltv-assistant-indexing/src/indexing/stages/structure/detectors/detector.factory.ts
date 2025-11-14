/**
 * Heading Detector Factory
 * Based on specs from docs/plans/structure-stage.md
 *
 * Selects appropriate heading detector based on parser type
 */

import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { MarkdownHeadingDetector } from './markdown-heading.detector';
import { PdfHeadingDetector } from './pdf-heading.detector';
import { AllCapsHeadingDetector } from './all-caps-heading.detector';
import { DocxHeadingDetector } from './docx-heading.detector';
import { CodeHeadingDetector } from './code-heading.detector';
import { Heading, HeadingDetectionOutput } from '../types';

@Injectable()
export class HeadingDetectorFactory {
  private readonly logger = new Logger(HeadingDetectorFactory.name);

  constructor(
    private readonly markdownDetector: MarkdownHeadingDetector,
    private readonly pdfDetector: PdfHeadingDetector,
    private readonly allCapsDetector: AllCapsHeadingDetector,
    private readonly docxDetector: DocxHeadingDetector,
    private readonly codeDetector: CodeHeadingDetector,
  ) {}

  /**
   * Detect headings using appropriate detector based on parser type
   *
   * @param documents - Parsed documents from Parse Stage
   * @param parserType - Parser type used
   * @param filename - Original filename
   * @returns Heading detection output
   */
  detect(
    documents: Document[],
    parserType: string,
    filename: string,
  ): HeadingDetectionOutput {
    const fullText = documents.map((d) => d.pageContent).join('\n\n');

    this.logger.log(
      `Detecting headings for ${filename} (parserType: ${parserType}, ${fullText.length} chars)`,
    );

    let headings: Heading[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let detectionMethod = '';

    // Select detector based on parser type
    switch (parserType) {
      case 'markdown':
        headings = this.markdownDetector.detect(fullText);
        confidence = 'high';
        detectionMethod = 'markdown';
        break;

      case 'pdf':
        // Try multiple methods for PDF
        headings = this.detectPdf(fullText);
        confidence = headings.length > 0 ? 'medium' : 'low';
        detectionMethod = 'pdf-heuristics';
        break;

      case 'docx': {
        // Try DOCX style metadata first
        const docxFromMetadata =
          this.docxDetector.detectFromDocuments(documents);
        if (docxFromMetadata.length > 0) {
          headings = docxFromMetadata;
          confidence = 'high';
          detectionMethod = 'docx-styles';
        } else {
          // Fallback to text patterns
          headings = this.docxDetector.detectFromText(fullText);
          confidence = 'medium';
          detectionMethod = 'docx-patterns';
        }
        break;
      }

      case 'code': {
        // Detect language from filename
        const language = this.getLanguageFromFilename(filename);
        headings = this.codeDetector.detect(fullText, language);
        confidence = 'high';
        detectionMethod = `code-${language}`;
        break;
      }

      case 'text':
      default:
        // Try multiple methods for plain text
        headings = this.detectText(fullText);
        confidence = headings.length > 0 ? 'medium' : 'low';
        detectionMethod = 'text-multi-method';
        break;
    }

    // Sort headings by offset
    headings.sort((a, b) => a.startOffset - b.startOffset);

    // Validate levels (1-6)
    headings = headings.filter((h) => h.level >= 1 && h.level <= 6);

    const hasStructure = headings.length > 0;

    this.logger.log(
      `Detected ${headings.length} headings (confidence: ${confidence}, method: ${detectionMethod})`,
    );

    return {
      headings,
      confidence,
      hasStructure,
    };
  }

  /**
   * Detect PDF headings using multiple methods
   *
   * @param text - Full text
   * @returns Headings
   */
  private detectPdf(text: string): Heading[] {
    // Try PDF heuristics first
    let headings = this.pdfDetector.detect(text);

    // If not found, try ALL CAPS fallback
    if (headings.length === 0) {
      headings = this.allCapsDetector.detect(text);
      this.logger.log('PDF: Using ALL CAPS fallback');
    }

    return headings;
  }

  /**
   * Detect text headings using multiple methods
   *
   * @param text - Full text
   * @returns Headings
   */
  private detectText(text: string): Heading[] {
    // Try Markdown first
    if (this.markdownDetector.hasMarkdownHeadings(text)) {
      this.logger.log('Text: Found Markdown headings');
      return this.markdownDetector.detect(text);
    }

    // Try ALL CAPS
    if (this.allCapsDetector.hasAllCapsHeadings(text)) {
      this.logger.log('Text: Found ALL CAPS headings');
      return this.allCapsDetector.detect(text);
    }

    // No clear structure found
    return [];
  }

  /**
   * Get programming language from filename extension
   *
   * @param filename - Filename
   * @returns Language identifier
   */
  private getLanguageFromFilename(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    const languageMap: Record<string, string> = {
      py: 'python',
      js: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      jsx: 'javascript',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      go: 'go',
      rs: 'rust',
      rb: 'ruby',
      php: 'php',
    };

    return languageMap[ext] || 'unknown';
  }
}
