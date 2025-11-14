import { Injectable, Logger } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { FlatSection, ParentChunk, ChunkMetadata } from '../types';
import { TokenCounterService } from './token-counter.service';
import { ChunkIdGeneratorService } from './chunk-id-generator.service';

/**
 * Parent Chunk Splitter Service
 * Splits sections into parent chunks (1800 tokens target)
 * Uses token-based lengthFunction for 100% accuracy
 */
@Injectable()
export class ParentChunkSplitterService {
  private readonly logger = new Logger(ParentChunkSplitterService.name);
  private readonly TARGET_TOKENS = 1800;
  private readonly MIN_TOKENS = 100; // Very small sections - keep as single chunk
  private readonly WARNING_THRESHOLD = 10000; // Warn if exceeds, but still accept
  private readonly OVERLAP_TOKENS = 180; // 10% of TARGET_TOKENS

  private splitter: RecursiveCharacterTextSplitter;

  constructor(
    private readonly tokenCounter: TokenCounterService,
    private readonly idGenerator: ChunkIdGeneratorService,
  ) {
    this.initializeSplitter();
  }

  /**
   * Initialize RecursiveCharacterTextSplitter with parent chunk config
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
      `Parent chunk splitter initialized: target=${this.TARGET_TOKENS} tokens, overlap=${this.OVERLAP_TOKENS} tokens (token-based)`,
    );
  }

  /**
   * Split section into parent chunks
   * @param section - Flat section from Structure Stage
   * @param documentId - Document ID
   * @param fileId - File ID
   * @param startIndex - Starting chunk index for this section (for document-level ordering)
   * @returns Array of parent chunks
   */
  async splitSection(
    section: FlatSection,
    documentId: string,
    fileId: string,
    startIndex: number = 0,
  ): Promise<ParentChunk[]> {
    const parentChunks: ParentChunk[] = [];

    // Check if section is too small
    const tokenCount = this.tokenCounter.countTokens(section.content);

    if (tokenCount < this.MIN_TOKENS) {
      // Section small -> Keep as single parent chunk
      this.logger.log(
        `Section ${section.id} is small (${tokenCount} tokens), keeping as single parent chunk`,
      );

      const chunk: ParentChunk = {
        id: this.idGenerator.generateParentId(section.content),
        documentId,
        fileId,
        content: section.content,
        tokens: tokenCount,
        chunkIndex: startIndex,
        metadata: this.buildMetadata(section, 0, section.content.length),
      };

      return [chunk];
    }

    // Split section into parent chunks
    const splits = await this.splitter.splitText(section.content);

    this.logger.log(
      `Section ${section.id} split into ${splits.length} parent chunks`,
    );

    for (let i = 0; i < splits.length; i++) {
      const chunkContent = splits[i];
      const chunkTokens = this.tokenCounter.countTokens(chunkContent);

      // Warn if chunk is very large, but ALWAYS accept (no hard limit for parent chunks)
      if (chunkTokens > this.WARNING_THRESHOLD) {
        this.logger.warn(
          `Parent chunk ${i} is very large (${chunkTokens} tokens, warning threshold: ${this.WARNING_THRESHOLD}). ` +
            `This is acceptable since parent chunks don't need embedding.`,
        );
      }

      // Accept all chunks - no minimum or maximum rejection
      // Parent chunks don't need embedding, so no hard limits

      const chunk: ParentChunk = {
        id: this.idGenerator.generateParentId(chunkContent),
        documentId,
        fileId,
        content: chunkContent,
        tokens: chunkTokens,
        chunkIndex: startIndex + parentChunks.length,
        metadata: this.buildMetadata(
          section,
          this.calculateOffset(section.content, chunkContent, i),
          this.calculateOffset(section.content, chunkContent, i) +
            chunkContent.length,
        ),
      };

      parentChunks.push(chunk);
    }

    return parentChunks;
  }

  /**
   * Build chunk metadata from section metadata
   */
  private buildMetadata(
    section: FlatSection,
    offsetStart: number,
    offsetEnd: number,
  ): ChunkMetadata {
    return {
      sectionId: section.id,
      sectionPath: section.sectionPath,
      sectionLevel: section.level,
      offsetStart,
      offsetEnd,
      pageNumber: section.metadata.pageNumber,
    };
  }

  /**
   * Calculate offset of chunk content within section
   */
  private calculateOffset(
    sectionContent: string,
    chunkContent: string,
    chunkIndex: number,
  ): number {
    // Try to find exact match
    const index = sectionContent.indexOf(chunkContent);
    if (index !== -1) {
      return index;
    }

    // Fallback: estimate based on chunk index (assuming ~4 chars per token)
    const estimatedPosition = chunkIndex * (this.TARGET_TOKENS * 4);
    return Math.min(estimatedPosition, sectionContent.length);
  }
}
