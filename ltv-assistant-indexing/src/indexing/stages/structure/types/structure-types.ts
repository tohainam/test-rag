/**
 * Structure Stage Type Definitions
 * Based on specs from docs/plans/structure-stage.md
 */

/**
 * Heading detection types
 */
export type HeadingType =
  | 'markdown'
  | 'pdf-bold-size'
  | 'all-caps'
  | 'docx-style'
  | 'code-class'
  | 'code-function';

export interface Heading {
  level: number; // 1-6
  title: string;
  startOffset: number;
  endOffset?: number;
  type: HeadingType;
  metadata?: Record<string, unknown>;
}

export interface HeadingDetectionOutput {
  headings: Heading[];
  confidence: 'high' | 'medium' | 'low';
  hasStructure: boolean;
}

/**
 * Document tree structures
 */
export interface SectionMetadata {
  sectionPath: string;
  pageNumber?: number;
  lineNumberStart?: number;
  lineNumberEnd?: number;
  offsetStart: number;
  offsetEnd: number;
  wordCount: number;
}

export interface DocumentNode {
  id: string;
  type: 'document' | 'section';
  title: string;
  level: number;
  content: string;
  children: DocumentNode[];
  metadata: SectionMetadata;
}

/**
 * Boundary detection types
 */
export type BoundaryType = 'section' | 'paragraph' | 'sentence';
export type BoundaryStrength = 'strong' | 'medium' | 'weak';

export interface Boundary {
  type: BoundaryType;
  offset: number;
  strength: BoundaryStrength;
}

export interface AnnotatedDocumentNode extends DocumentNode {
  boundaries: Boundary[];
  children: AnnotatedDocumentNode[];
}

/**
 * Flat section structure (output for Chunk Stage)
 */
export interface FlatSection {
  id: string;
  title: string;
  level: number;
  content: string;
  sectionPath: string;
  boundaries: Boundary[];
  metadata: SectionMetadata;
}

/**
 * Structured document (final output)
 */
export interface StructuredDocument {
  id: string; // fileId
  title: string; // filename
  sections: FlatSection[];
  metadata: {
    totalSections: number;
    averageWordCount: number;
    hasStructure: boolean;
  };
}

/**
 * Tree construction statistics
 */
export interface TreeStatistics {
  totalSections: number;
  maxDepth: number;
  averageDepth: number;
}

/**
 * Boundary detection statistics
 */
export interface BoundaryStatistics {
  totalSections: number;
  totalParagraphs: number;
  totalSentences: number;
}
