import { Injectable, Logger } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ParentChunk, ChildChunk } from '../types';
import { TokenCounterService } from './token-counter.service';
import { ChunkIdGeneratorService } from './chunk-id-generator.service';

/**
 * Child Chunk Splitter Service
 * Splits parent chunks into child chunks (512 tokens target)
 * Uses token-based lengthFunction for 100% accuracy
 * Enforces 8,191 token hard limit for embedding compatibility
 */
@Injectable()
export class ChildChunkSplitterService {
  private readonly logger = new Logger(ChildChunkSplitterService.name);
  private readonly TARGET_TOKENS = 512;
  private readonly OVERLAP_TOKENS = 50; // ~10% of TARGET_TOKENS
  private readonly EMBEDDING_MAX_TOKENS = 8191; // Hard limit for embedding models
  private readonly MIN_TOKENS = 100; // Very small parents - keep as single child

  private splitter: RecursiveCharacterTextSplitter;

  constructor(
    private readonly tokenCounter: TokenCounterService,
    private readonly idGenerator: ChunkIdGeneratorService,
  ) {
    this.initializeSplitter();
  }

  /**
   * Initialize RecursiveCharacterTextSplitter with child chunk config
   * Uses token-based lengthFunction for 100% accuracy
   */
  private initializeSplitter(): void {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.TARGET_TOKENS,
      chunkOverlap: this.OVERLAP_TOKENS,
      separators: ['\n\n', '\n', '. ', ', ', ' ', ''],
      // 🔑 CRITICAL: Use token-based length function for 100% accuracy
      lengthFunction: (text: string) => {
        return this.tokenCounter.countTokens(text);
      },
    });

    this.logger.log(
      `Child chunk splitter initialized: target=${this.TARGET_TOKENS} tokens, overlap=${this.OVERLAP_TOKENS} tokens (token-based)`,
    );
  }

  /**
   * Split parent chunk into child chunks
   * @param parentChunk - Parent chunk to split
   * @param startIndex - Starting chunk index for this parent (for document-level ordering)
   * @returns Array of child chunks
   */
  async splitParent(
    parentChunk: ParentChunk,
    startIndex: number = 0,
  ): Promise<ChildChunk[]> {
    const childChunks: ChildChunk[] = [];

    // Check if parent is too small
    if (parentChunk.tokens < this.MIN_TOKENS) {
      // Parent small -> Keep as single child
      this.logger.log(
        `Parent chunk ${parentChunk.id} is small (${parentChunk.tokens} tokens), keeping as single child chunk`,
      );

      const child: ChildChunk = {
        id: this.idGenerator.generateChildId(parentChunk.content),
        parentChunkId: parentChunk.id,
        documentId: parentChunk.documentId,
        fileId: parentChunk.fileId,
        content: parentChunk.content,
        tokens: parentChunk.tokens,
        chunkIndex: startIndex,
        metadata: {
          ...parentChunk.metadata,
          isOnlyChild: true,
        },
      };

      return [child];
    }

    // Split parent into children
    const splits = await this.splitter.splitText(parentChunk.content);

    this.logger.log(
      `Parent chunk ${parentChunk.id} split into ${splits.length} child chunks`,
    );

    for (let i = 0; i < splits.length; i++) {
      const childContent = splits[i];
      const childTokens = this.tokenCounter.countTokens(childContent);

      // 🚨 CRITICAL: Enforce embedding limit - must force split if exceeds
      if (childTokens > this.EMBEDDING_MAX_TOKENS) {
        this.logger.error(
          `Child chunk ${i} exceeds embedding limit (${childTokens} > ${this.EMBEDDING_MAX_TOKENS}), force splitting...`,
        );

        // Force split by word boundaries - last resort to stay under limit
        const forcedSplits = this.forceSplitByWords(
          childContent,
          parentChunk,
          childChunks.length,
        );

        childChunks.push(...forcedSplits);
        continue;
      }

      // Accept all chunks - even very small ones to prevent data loss
      if (childTokens < 50) {
        this.logger.log(
          `Child chunk is very small: ${childTokens} tokens, but keeping to prevent data loss`,
        );
      }

      const child: ChildChunk = {
        id: this.idGenerator.generateChildId(childContent),
        parentChunkId: parentChunk.id,
        documentId: parentChunk.documentId,
        fileId: parentChunk.fileId,
        content: childContent,
        tokens: childTokens,
        chunkIndex: startIndex + childChunks.length,
        metadata: {
          ...parentChunk.metadata,
          isOnlyChild: false,
        },
      };

      childChunks.push(child);
    }

    // Ensure we have at least one child
    if (childChunks.length === 0) {
      this.logger.warn(
        `No valid child chunks created from parent ${parentChunk.id}, using parent as single child`,
      );

      const child: ChildChunk = {
        id: this.idGenerator.generateChildId(parentChunk.content),
        parentChunkId: parentChunk.id,
        documentId: parentChunk.documentId,
        fileId: parentChunk.fileId,
        content: parentChunk.content,
        tokens: parentChunk.tokens,
        chunkIndex: startIndex,
        metadata: {
          ...parentChunk.metadata,
          isOnlyChild: true,
        },
      };

      return [child];
    }

    return childChunks;
  }

  /**
   * Force split by word boundaries - last resort for chunks exceeding embedding limit
   * This method ensures we NEVER create a child chunk > 8,191 tokens
   * @param content - Oversized chunk content
   * @param parentChunk - Parent chunk
   * @param startIndex - Starting chunk index
   * @returns Array of force-split chunks
   */
  private forceSplitByWords(
    content: string,
    parentChunk: ParentChunk,
    startIndex: number,
  ): ChildChunk[] {
    const chunks: ChildChunk[] = [];
    const words = content.split(/\s+/);

    let currentChunk = '';
    let currentTokens = 0;

    for (const word of words) {
      const wordTokens = this.tokenCounter.countTokens(word);

      // Would adding this word exceed the embedding limit?
      if (currentTokens + wordTokens > this.EMBEDDING_MAX_TOKENS) {
        // Save current chunk if it has content
        if (currentChunk) {
          chunks.push({
            id: this.idGenerator.generateChildId(currentChunk),
            parentChunkId: parentChunk.id,
            documentId: parentChunk.documentId,
            fileId: parentChunk.fileId,
            content: currentChunk,
            tokens: currentTokens,
            chunkIndex: startIndex + chunks.length,
            metadata: {
              ...parentChunk.metadata,
              isOnlyChild: false,
            },
          });
        }

        // Start new chunk with this word
        currentChunk = word;
        currentTokens = wordTokens;
      } else {
        // Add word to current chunk
        currentChunk += (currentChunk ? ' ' : '') + word;
        currentTokens += wordTokens;
      }
    }

    // Save final chunk
    if (currentChunk) {
      chunks.push({
        id: this.idGenerator.generateChildId(currentChunk),
        parentChunkId: parentChunk.id,
        documentId: parentChunk.documentId,
        fileId: parentChunk.fileId,
        content: currentChunk,
        tokens: currentTokens,
        chunkIndex: startIndex + chunks.length,
        metadata: {
          ...parentChunk.metadata,
          isOnlyChild: false,
        },
      });
    }

    this.logger.log(
      `Force split by words created ${chunks.length} chunks (all <= ${this.EMBEDDING_MAX_TOKENS} tokens)`,
    );

    return chunks;
  }

  /**
   * Split multiple parent chunks into child chunks
   * @param parentChunks - Array of parent chunks
   * @returns Array of all child chunks
   */
  async splitParents(parentChunks: ParentChunk[]): Promise<ChildChunk[]> {
    const allChildChunks: ChildChunk[] = [];

    for (const parent of parentChunks) {
      // Pass cumulative index to ensure document-level sequential ordering
      const children = await this.splitParent(parent, allChildChunks.length);
      allChildChunks.push(...children);
    }

    this.logger.log(
      `Split ${parentChunks.length} parent chunks into ${allChildChunks.length} child chunks`,
    );

    return allChildChunks;
  }
}
