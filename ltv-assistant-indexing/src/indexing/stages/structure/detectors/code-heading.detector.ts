/**
 * Code Heading Detector
 * Based on specs from docs/plans/structure-stage.md - Section: ĐC-1
 *
 * Detects code structure (classes, functions) as headings
 * Confidence: HIGH (for code files)
 */

import { Injectable, Logger } from '@nestjs/common';
import { Heading } from '../types';

@Injectable()
export class CodeHeadingDetector {
  private readonly logger = new Logger(CodeHeadingDetector.name);

  // Language-specific patterns
  private readonly pythonClassRegex = /^class\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  private readonly pythonFunctionRegex = /^def\s+([A-Za-z_][A-Za-z0-9_]*)/gm;

  private readonly jsClassRegex =
    /^(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  private readonly jsFunctionRegex =
    /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/gm;

  private readonly tsInterfaceRegex =
    /^(?:export\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  private readonly tsTypeRegex =
    /^(?:export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)/gm;

  /**
   * Detect code structure headings
   *
   * @param text - Code content
   * @param language - Programming language
   * @returns Array of detected headings
   */
  detect(text: string, language: string): Heading[] {
    const headings: Heading[] = [];

    switch (language.toLowerCase()) {
      case 'python':
        headings.push(...this.detectPython(text));
        break;

      case 'javascript':
      case 'js':
        headings.push(...this.detectJavaScript(text));
        break;

      case 'typescript':
      case 'ts':
      case 'typescript-react':
      case 'tsx':
        headings.push(...this.detectTypeScript(text));
        break;

      default:
        this.logger.log(
          `No code structure detection for language: ${language}`,
        );
    }

    this.logger.log(
      `Detected ${headings.length} code structure headings for ${language}`,
    );

    return headings;
  }

  /**
   * Detect Python code structure
   *
   * @param code - Python code
   * @returns Headings
   */
  private detectPython(code: string): Heading[] {
    const headings: Heading[] = [];

    // File header (docstring at top)
    const docstringMatch = /^"""(.+?)"""/s.exec(code);
    if (docstringMatch) {
      const title = docstringMatch[1].trim().split('\n')[0]; // First line only
      headings.push({
        level: 1,
        title: title || 'File Header',
        startOffset: 0,
        endOffset: docstringMatch[0].length,
        type: 'code-class',
      });
    }

    // Classes → Level 2
    this.pythonClassRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = this.pythonClassRegex.exec(code)) !== null) {
      headings.push({
        level: 2,
        title: `Class: ${match[1]}`,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        type: 'code-class',
      });
    }

    // Functions → Level 3
    this.pythonFunctionRegex.lastIndex = 0;
    while ((match = this.pythonFunctionRegex.exec(code)) !== null) {
      headings.push({
        level: 3,
        title: `Function: ${match[1]}`,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        type: 'code-function',
      });
    }

    return headings;
  }

  /**
   * Detect JavaScript code structure
   *
   * @param code - JavaScript code
   * @returns Headings
   */
  private detectJavaScript(code: string): Heading[] {
    const headings: Heading[] = [];

    // Classes → Level 2
    this.jsClassRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = this.jsClassRegex.exec(code)) !== null) {
      headings.push({
        level: 2,
        title: `Class: ${match[1]}`,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        type: 'code-class',
      });
    }

    // Functions → Level 3
    this.jsFunctionRegex.lastIndex = 0;
    while ((match = this.jsFunctionRegex.exec(code)) !== null) {
      headings.push({
        level: 3,
        title: `Function: ${match[1]}`,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        type: 'code-function',
      });
    }

    return headings;
  }

  /**
   * Detect TypeScript code structure
   *
   * @param code - TypeScript code
   * @returns Headings
   */
  private detectTypeScript(code: string): Heading[] {
    const headings: Heading[] = [];

    // Start with JavaScript patterns
    headings.push(...this.detectJavaScript(code));

    // Interfaces → Level 2
    this.tsInterfaceRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = this.tsInterfaceRegex.exec(code)) !== null) {
      headings.push({
        level: 2,
        title: `Interface: ${match[1]}`,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        type: 'code-class',
      });
    }

    // Types → Level 3
    this.tsTypeRegex.lastIndex = 0;
    while ((match = this.tsTypeRegex.exec(code)) !== null) {
      headings.push({
        level: 3,
        title: `Type: ${match[1]}`,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        type: 'code-class',
      });
    }

    // Sort by offset
    headings.sort((a, b) => a.startOffset - b.startOffset);

    return headings;
  }
}
