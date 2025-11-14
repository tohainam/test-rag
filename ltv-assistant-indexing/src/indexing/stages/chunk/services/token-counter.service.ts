import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { encodingForModel, Tiktoken } from 'js-tiktoken';
import { TokenizerError } from '../errors';

/**
 * Token Counter Service
 * Uses js-tiktoken with cl100k_base encoding (GPT-3.5/4 compatible)
 * for accurate token counting
 */
@Injectable()
export class TokenCounterService implements OnModuleDestroy {
  private readonly logger = new Logger(TokenCounterService.name);
  private encoding: Tiktoken | null = null;
  private readonly MODEL_ENCODING = 'gpt-3.5-turbo';

  constructor() {
    this.initializeEncoding();
  }

  /**
   * Initialize tiktoken encoding on service creation
   */
  private initializeEncoding(): void {
    try {
      this.encoding = encodingForModel(this.MODEL_ENCODING);
      this.logger.log(
        `Token counter initialized with encoding: ${this.MODEL_ENCODING}`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize tiktoken encoding', error);
      throw new TokenizerError(
        'Failed to initialize tokenizer',
        error as Error,
      );
    }
  }

  /**
   * Count tokens in text using tiktoken
   * @param text - Text to count tokens for
   * @returns Number of tokens
   * @throws TokenizerError if encoding fails
   */
  countTokens(text: string): number {
    if (!this.encoding) {
      throw new TokenizerError('Tokenizer not initialized');
    }

    try {
      const tokens = this.encoding.encode(text);
      return tokens.length;
    } catch (error) {
      this.logger.error('Token counting failed', error);
      throw new TokenizerError(
        `Failed to count tokens for text of length ${text.length}`,
        error as Error,
      );
    }
  }

  /**
   * Count tokens for multiple texts in batch
   * @param texts - Array of texts to count
   * @returns Array of token counts
   */
  countTokensBatch(texts: string[]): number[] {
    return texts.map((text) => this.countTokens(text));
  }

  /**
   * Validate token count against range
   * @param tokenCount - Actual token count
   * @param minTokens - Minimum allowed tokens
   * @param maxTokens - Maximum allowed tokens
   * @returns true if valid, false otherwise
   */
  validateTokenCount(
    tokenCount: number,
    minTokens: number,
    maxTokens: number,
  ): boolean {
    return tokenCount >= minTokens && tokenCount <= maxTokens;
  }

  /**
   * Estimate character count from token count
   * @param tokenCount - Number of tokens
   * @param charsPerToken - Average characters per token (default: 4)
   * @returns Estimated character count
   */
  estimateCharCount(tokenCount: number, charsPerToken: number = 4): number {
    return tokenCount * charsPerToken;
  }

  /**
   * Estimate token count from character count
   * @param charCount - Number of characters
   * @param charsPerToken - Average characters per token (default: 4)
   * @returns Estimated token count
   */
  estimateTokenCount(charCount: number, charsPerToken: number = 4): number {
    return Math.ceil(charCount / charsPerToken);
  }

  /**
   * Cleanup: Free encoding resources when module is destroyed
   */
  onModuleDestroy(): void {
    if (this.encoding) {
      try {
        // Free the encoding instance
        const encodingWithFree = this.encoding as unknown as {
          free: () => void;
        };
        encodingWithFree.free();
        this.logger.log('Token counter encoding freed');
      } catch (error) {
        this.logger.warn('Failed to free encoding:', error);
      }
    }
  }
}
