/**
 * Enrich Stage Types
 * Defines all type interfaces for the enrichment stage
 * Based on specs from docs/plans/enrich-stage.md
 */

/**
 * Entity types that can be extracted from text
 */
export type EntityType =
  | 'PERSON' // John Smith
  | 'ORGANIZATION' // Microsoft Corporation
  | 'LOCATION' // New York City
  | 'DATE' // 2025-11-04
  | 'MONEY' // $1,000,000
  | 'PERCENT' // 25%
  | 'EMAIL' // user@example.com
  | 'URL' // https://example.com
  | 'PHONE' // +1-234-567-8900
  | 'CONCEPT'; // machine learning (technical terms)

/**
 * Extracted entity with metadata
 */
export interface Entity {
  type: EntityType;
  text: string;
  confidence: number; // 0.0 - 1.0
  offsets?: [number, number][]; // Character positions in chunk
}

/**
 * Hierarchical metadata added to chunks
 * Preserves document structure and context
 */
export interface HierarchicalMetadata {
  // Document context
  documentId: string;
  fileId: string;
  filename: string;
  documentType: 'pdf' | 'docx' | 'text' | 'code' | 'markdown';

  // Section context (from Structure Stage)
  sectionPath: string; // "Chapter 1 > Section 1.1 > Subsection 1.1.1"
  sectionLevel: number; // 3 (depth in hierarchy)
  sectionId?: string;

  // Page/line context (if available)
  pageNumber?: number;
  lineNumberStart?: number;
  lineNumberEnd?: number;

  // Chunk hierarchy
  parentChunkId?: string; // For child chunks
  childChunkIds?: string[]; // For parent chunks
  chunkIndex: number; // Position in parent/section

  // Offsets (from original document)
  offsetStart?: number;
  offsetEnd?: number;

  // Timestamps
  enrichedAt: Date;
}

/**
 * Enriched parent chunk with optional LLM-generated content
 */
export interface EnrichedParentChunk {
  id: string;
  documentId: string;
  fileId: string;
  content: string; // Original content (NEVER modified)
  tokens: number; // Token count (NEVER modified)
  chunkIndex: number;
  metadata: HierarchicalMetadata & {
    // Algorithmic enrichments
    entities?: Entity[];
    keywords?: string[];

    // Optional LLM enrichments (OFF by default)
    summary?: string; // 2-3 sentence summary
    hypotheticalQuestions?: string[]; // 3-5 questions for Multi-Vector retrieval
  };
}

/**
 * Enriched child chunk with algorithmic enrichments only
 */
export interface EnrichedChildChunk {
  id: string;
  parentChunkId: string;
  documentId: string;
  fileId: string;
  content: string; // Original content (NEVER modified)
  tokens: number; // Token count (NEVER modified)
  chunkIndex: number;
  metadata: HierarchicalMetadata & {
    // Algorithmic enrichments only (no LLM for children)
    entities?: Entity[];
    isOnlyChild?: boolean; // True if parent had only one child
  };
}

/**
 * Summary generation result (from LLM)
 */
export interface SummaryResult {
  summary: string; // 2-3 sentence summary
  tokensUsed: number; // LLM tokens consumed
  durationMs: number; // Generation time
}

/**
 * Hypothetical questions generation result (from LLM)
 */
export interface HypotheticalQuestionsResult {
  questions: string[]; // 3-5 questions
  tokensUsed: number; // LLM tokens consumed
  durationMs: number; // Generation time
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Enrichment configuration from environment variables
 */
export interface EnrichmentConfig {
  // Entity extraction (algorithmic)
  entityExtraction: {
    enabled: boolean; // Default: true
    methods: string[]; // ['regex', 'nlp']
    minConfidence: number; // Default: 0.5
  };

  // Keyword extraction
  keywordExtraction: {
    method: 'tfidf' | 'llm' | 'none'; // Default: 'tfidf'
    topK: number; // Default: 10
  };

  // Summary generation (LLM-based, optional)
  summaryGeneration: {
    enabled: boolean; // Default: false
    provider?: 'openai' | 'google' | 'anthropic' | 'ollama'; // Optional override
    model?: string; // Optional model override
    maxTokens: number; // Default: 100
    temperature: number; // Default: 0.3
    batchSize: number; // Default: 10
    timeout: number; // Default: 30000ms
  };

  // Hypothetical questions generation (Multi-Vector, optional)
  hypotheticalQuestions: {
    enabled: boolean; // Default: false
    provider?: 'openai' | 'google' | 'anthropic' | 'ollama'; // Optional override
    model?: string; // Optional model override
    questionsPerChunk: number; // Default: 3-5
    maxTokens: number; // Default: 150
    temperature: number; // Default: 0.7 (more creative)
    batchSize: number; // Default: 10
    timeout: number; // Default: 30000ms
  };

  // LLM Provider configuration
  llmProvider: {
    global: 'openai' | 'google' | 'anthropic' | 'ollama'; // Default: 'ollama'
  };
}

/**
 * Enrichment statistics for monitoring
 */
export interface EnrichmentStatistics {
  totalParents: number;
  totalChildren: number;
  parentsWithEntities: number;
  parentsWithKeywords: number;
  parentsWithSummaries: number;
  parentsWithQuestions: number;
  averageEntitiesPerChunk: number;
  averageKeywordsPerChunk: number;
  llmTokensUsed: number;
  durationMs: number;
}
