# Enrich Stage Improvement Plan

**Version:** 1.0
**Created:** 2025-11-04
**Status:** Draft
**Related:** enrich-stage.md (base implementation)

---

## Executive Summary

This document outlines improvements to the Enrich Stage to achieve feature parity with the system architecture diagram and add missing critical functionality. The current enrich-stage.md plan is missing several features shown in the diagram, particularly around **Knowledge Graph construction** and **document-level metadata**.

**Current State:** Enrich Stage v1.4 includes hierarchical metadata, entity extraction, keywords, and optional LLM features (summaries, hypothetical questions).


---

## Table of Contents

1. [Gap Analysis](#gap-analysis)
2. [Improvement Objectives](#improvement-objectives)
3. [Technical Specifications](#technical-specifications)
4. [Implementation Plan](#implementation-plan)
5. [Database Schema Changes](#database-schema-changes)
6. [Dependencies & Integration](#dependencies--integration)
7. [Testing Strategy](#testing-strategy)
8. [Success Metrics](#success-metrics)
9. [Risks & Mitigation](#risks--mitigation)

---

## Gap Analysis

### What's Missing from Current Plan vs. Diagram

| Feature | Diagram | Current Plan (v1.4) | Gap | Priority |
|---------|---------|---------------------|-----|----------|
| **Document Metadata** |
| Author | ✅ | ❌ | Missing | P1 |
| Access Control (public/restricted) | ✅ | ❌ | Missing | P1 |
| Document Type | ✅ | ✅ (partial) | Needs expansion | P2 |
| Timestamp | ✅ | ✅ (`enrichedAt`) | Covered | - |
| **Knowledge Graph** |
| Entity Extraction | ✅ | ✅ (algorithmic only) | Need LLM option | P1 |
| **Relation Extraction** | ✅ | ❌ | **Missing (Critical)** | **P0** |
| Cypher Generation | ✅ | ❌ | Missing | P0 |
| **Existing Strong Features** |
| Hierarchical Metadata | ❌ (not shown) | ✅ (P0) | Plan is better | - |
| Keywords Extraction | ❌ | ✅ | Plan has more | - |
| Multi-Vector (Summaries/Q&A) | ✅ | ✅ | Covered | - |
| Multi-Provider LLM | ❌ | ✅ | Plan has more | - |

### Critical Gaps Identified

1. **❌ P0 - Relation Extraction:** Cannot build Knowledge Graph without extracting relationships between entities
3. **❌ P1 - Document Metadata:** Missing author and access control fields
4. **⚠️ P1 - Entity Extraction Quality:** Current algorithmic approach may not be sufficient for complex relation extraction

---

## Improvement Objectives

### Primary Objectives (P0)

**OBJ-1: Knowledge Graph Relation Extraction**
- Extract semantic relationships between entities (e.g., "John WORKS_FOR Microsoft")
- Support common relation types: WORKS_FOR, LOCATED_IN, PART_OF, RELATED_TO, MENTIONS, etc.
- Use LLM for high-quality extraction (configurable)
- Fallback to rule-based patterns for common relations

**OBJ-2: Cypher Query Generation**
- Support entity nodes and relationship edges
- Handle duplicate detection (MERGE vs CREATE)
- Batch queries for performance

- Move KG construction from Persist Stage to Enrich Stage (align with diagram)
- Enrich Stage outputs: enriched chunks + Cypher queries
- Persist Stage only executes Cypher (storage, not logic)

### Secondary Objectives (P1)

**OBJ-4: Document-Level Metadata**
- Add author extraction (from file metadata or content)
- Add access control classification (public/restricted/confidential)
- Integrate with existing metadata enrichment

**OBJ-5: Enhanced Entity Extraction**
- Add LLM-based entity extraction option (higher quality)
- Keep algorithmic extraction as default (fast, free)
- Configurable per document type

### Tertiary Objectives (P2)

**OBJ-6: Document Type Expansion**
- Expand document type classification beyond basic types
- Add subtypes: 'legal-contract', 'medical-report', 'technical-spec', etc.
- Use for customized enrichment strategies

---

## Technical Specifications

### ĐC-1: Relation Extraction Service

**Purpose:** Extract semantic relationships between entities for Knowledge Graph construction

**Architecture:**

```typescript
@Injectable()
export class RelationExtractionService {
  constructor(
    private configService: ConfigService,
    private llmProviderFactory: LLMProviderFactory,
    private entityExtractor: AlgorithmicEntityExtractorService
  ) {}

  async extractRelations(
    chunk: EnrichedChunk,
    entities: Entity[]
  ): Promise<Relation[]> {
    const method = this.configService.get('RELATION_EXTRACTION_METHOD');

    switch (method) {
      case 'llm':
        return this.extractWithLLM(chunk, entities);
      case 'rule-based':
        return this.extractWithRules(chunk, entities);
      case 'hybrid':
        return this.extractHybrid(chunk, entities);
      default:
        return []; // Disabled
    }
  }

  private async extractWithLLM(
    chunk: EnrichedChunk,
    entities: Entity[]
  ): Promise<Relation[]> {
    // Use LLM to extract relations
    const prompt = this.buildRelationExtractionPrompt(chunk, entities);
    const response = await this.model.invoke(prompt);
    return this.parseRelations(response);
  }

  private extractWithRules(
    chunk: EnrichedChunk,
    entities: Entity[]
  ): Promise<Relation[]> {
    // Rule-based patterns
    // Example: "X works for Y" → WORKS_FOR relation
    const relations: Relation[] = [];

    // Pattern 1: WORKS_FOR
    const worksForPattern = /(\w+(?:\s+\w+)*)\s+(?:works for|employed by|works at)\s+(\w+(?:\s+\w+)*)/gi;
    // ... extract using regex

    // Pattern 2: LOCATED_IN
    const locatedInPattern = /(\w+(?:\s+\w+)*)\s+(?:is located in|based in|in)\s+(\w+(?:\s+\w+)*)/gi;
    // ... extract using regex

    return Promise.resolve(relations);
  }

  private buildRelationExtractionPrompt(
    chunk: EnrichedChunk,
    entities: Entity[]
  ): string {
    return `Extract semantic relationships between entities in this text.

Text:
${chunk.content}

Entities found:
${entities.map(e => `- ${e.text} (${e.type})`).join('\n')}

Extract relationships in this format:
[Entity1] -[RELATIONSHIP_TYPE]-> [Entity2]

Common relationship types:
- WORKS_FOR (person works for organization)
- LOCATED_IN (entity is in location)
- PART_OF (entity is part of larger entity)
- RELATED_TO (generic relationship)
- MENTIONS (document mentions entity)

Only extract relationships explicitly stated or strongly implied in the text.
Output format (one per line):
[Entity1] -[TYPE]-> [Entity2]`;
  }

  private parseRelations(response: string): Relation[] {
    const relations: Relation[] = [];
    const lines = response.split('\n');

    const relationPattern = /\[(.+?)\]\s*-\[(.+?)\]->\s*\[(.+?)\]/;

    for (const line of lines) {
      const match = relationPattern.exec(line.trim());
      if (match) {
        relations.push({
          source: match[1].trim(),
          type: match[2].trim(),
          target: match[3].trim(),
          confidence: 0.8, // LLM-based, high confidence
        });
      }
    }

    return relations;
  }

  private async extractHybrid(
    chunk: EnrichedChunk,
    entities: Entity[]
  ): Promise<Relation[]> {
    // Try rule-based first (fast, free)
    const ruleBasedRelations = await this.extractWithRules(chunk, entities);

    // If insufficient relations found, use LLM
    if (ruleBasedRelations.length < 2) {
      const llmRelations = await this.extractWithLLM(chunk, entities);
      return [...ruleBasedRelations, ...llmRelations];
    }

    return ruleBasedRelations;
  }
}
```

**Types:**

```typescript
interface Relation {
  source: string;           // Source entity text
  target: string;           // Target entity text
  type: RelationType;       // Relationship type
  confidence: number;       // 0.0 - 1.0
  metadata?: {
    extractionMethod: 'llm' | 'rule-based';
    sourceOffset?: number;
    targetOffset?: number;
  };
}

type RelationType =
  | 'WORKS_FOR'
  | 'EMPLOYED_BY'
  | 'LOCATED_IN'
  | 'BASED_IN'
  | 'PART_OF'
  | 'BELONGS_TO'
  | 'RELATED_TO'
  | 'MENTIONS'
  | 'CONTAINS'
  | 'REFERENCES'
  | 'AUTHOR_OF'
  | 'CREATED_BY'
  | 'OWNED_BY';
```

**Configuration:**

```bash
# Relation Extraction Configuration
RELATION_EXTRACTION_ENABLED=true           # Default: true
RELATION_EXTRACTION_METHOD=hybrid          # Options: llm | rule-based | hybrid | none
RELATION_EXTRACTION_PROVIDER=openai        # LLM provider (if method=llm or hybrid)
RELATION_EXTRACTION_MODEL=gpt-4o-mini      # Model to use
RELATION_EXTRACTION_TEMPERATURE=0.3        # Low temp for consistency
RELATION_EXTRACTION_MAX_TOKENS=200         # Max tokens for response
RELATION_EXTRACTION_BATCH_SIZE=5           # Chunks per batch
```

---

### ĐC-2: Cypher Generation Service


**Architecture:**

```typescript
@Injectable()
export class CypherGenerationService {

  generateEntityNodes(entities: Entity[]): string[] {
    const queries: string[] = [];

    for (const entity of entities) {
      const nodeLabel = this.getNodeLabel(entity.type);
      const properties = this.escapeProperties({
        text: entity.text,
        type: entity.type,
        confidence: entity.confidence,
      });

      // Use MERGE to avoid duplicates
      const query = `
        MERGE (e:${nodeLabel} {text: $text})
        ON CREATE SET e += $properties
        ON MATCH SET e.lastSeen = timestamp()
      `.trim();

      queries.push({
        query,
        params: {
          text: entity.text,
          properties,
        },
      });
    }

    return queries;
  }

  generateRelationships(relations: Relation[]): string[] {
    const queries: string[] = [];

    for (const relation of relations) {
      const query = `
        MATCH (source {text: $sourceText})
        MATCH (target {text: $targetText})
        MERGE (source)-[r:${relation.type}]->(target)
        ON CREATE SET r.confidence = $confidence, r.createdAt = timestamp()
        ON MATCH SET r.lastSeen = timestamp()
      `.trim();

      queries.push({
        query,
        params: {
          sourceText: relation.source,
          targetText: relation.target,
          confidence: relation.confidence,
        },
      });
    }

    return queries;
  }

  generateChunkGraphNodes(
    chunk: EnrichedChunk,
    entities: Entity[],
    relations: Relation[]
  ): CypherBatch {
    const queries: CypherQuery[] = [];

    // 1. Create Chunk node
    queries.push({
      query: `
        CREATE (c:Chunk {
          id: $id,
          content: $content,
          tokens: $tokens,
          documentId: $documentId,
          sectionPath: $sectionPath
        })
      `,
      params: {
        id: chunk.id,
        content: chunk.content,
        tokens: chunk.tokens,
        documentId: chunk.metadata.documentId,
        sectionPath: chunk.metadata.sectionPath,
      },
    });

    // 2. Create entity nodes
    queries.push(...this.generateEntityNodes(entities));

    // 3. Create relationships
    queries.push(...this.generateRelationships(relations));

    // 4. Link chunk to entities (MENTIONS relationship)
    for (const entity of entities) {
      queries.push({
        query: `
          MATCH (c:Chunk {id: $chunkId})
          MATCH (e {text: $entityText})
          MERGE (c)-[r:MENTIONS]->(e)
          ON CREATE SET r.createdAt = timestamp()
        `,
        params: {
          chunkId: chunk.id,
          entityText: entity.text,
        },
      });
    }

    return {
      queries,
      chunkId: chunk.id,
      totalQueries: queries.length,
    };
  }

  private getNodeLabel(entityType: EntityType): string {
    const labelMap: Record<EntityType, string> = {
      PERSON: 'Person',
      ORGANIZATION: 'Organization',
      LOCATION: 'Location',
      DATE: 'Date',
      MONEY: 'Money',
      EMAIL: 'Email',
      URL: 'Url',
      PHONE: 'Phone',
      CONCEPT: 'Concept',
    };

    return labelMap[entityType] || 'Entity';
  }

  private escapeProperties(props: Record<string, unknown>): Record<string, unknown> {
    // Escape special characters for Cypher
    const escaped: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string') {
        escaped[key] = value.replace(/'/g, "\\'").replace(/"/g, '\\"');
      } else {
        escaped[key] = value;
      }
    }

    return escaped;
  }
}
```

**Types:**

```typescript
interface CypherQuery {
  query: string;               // Cypher query string
  params: Record<string, unknown>; // Query parameters
}

interface CypherBatch {
  queries: CypherQuery[];      // Batch of queries
  chunkId: string;             // Source chunk ID
  totalQueries: number;        // Count for tracking
  metadata?: {
    entities: number;
    relations: number;
  };
}
```

---

### ĐC-3: Document Metadata Extractor

**Purpose:** Extract document-level metadata (author, access control)

**Architecture:**

```typescript
@Injectable()
export class DocumentMetadataExtractor {

  async extractDocumentMetadata(
    fileMetadata: FileMetadata,
    content: string,
    documentType: string
  ): Promise<DocumentMetadata> {

    return {
      author: await this.extractAuthor(fileMetadata, content),
      accessControl: await this.classifyAccessControl(content, documentType),
      documentType: await this.classifyDocumentType(content, documentType),
      createdAt: fileMetadata.createdAt,
      modifiedAt: fileMetadata.modifiedAt,
      fileSize: fileMetadata.size,
      language: await this.detectLanguage(content),
    };
  }

  private async extractAuthor(
    fileMetadata: FileMetadata,
    content: string
  ): Promise<string | null> {

    // Method 1: From file metadata
    if (fileMetadata.author) {
      return fileMetadata.author;
    }

    // Method 2: From content patterns (PDFs, DOCX headers)
    const authorPatterns = [
      /Author:\s*(.+)/i,
      /By:\s*(.+)/i,
      /Written by:\s*(.+)/i,
      /Created by:\s*(.+)/i,
    ];

    for (const pattern of authorPatterns) {
      const match = pattern.exec(content);
      if (match) {
        return match[1].trim();
      }
    }

    // Method 3: Email addresses in header (first 500 chars)
    const header = content.slice(0, 500);
    const emailMatch = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i.exec(header);
    if (emailMatch) {
      return emailMatch[1];
    }

    return null; // Unknown author
  }

  private async classifyAccessControl(
    content: string,
    documentType: string
  ): Promise<AccessControlLevel> {

    // Rule-based classification
    const confidentialKeywords = [
      'confidential', 'secret', 'internal only', 'restricted',
      'proprietary', 'private', 'classified',
    ];

    const publicKeywords = [
      'public', 'published', 'press release', 'announcement',
      'open source', 'public domain',
    ];

    const lowerContent = content.toLowerCase();

    // Check for explicit markers (usually in first 1000 chars)
    const header = content.slice(0, 1000).toLowerCase();

    if (confidentialKeywords.some(kw => header.includes(kw))) {
      return 'restricted';
    }

    if (publicKeywords.some(kw => header.includes(kw))) {
      return 'public';
    }

    // Default based on document type
    const restrictedByDefault = ['contract', 'agreement', 'internal-memo'];
    if (restrictedByDefault.some(type => documentType.includes(type))) {
      return 'restricted';
    }

    return 'internal'; // Default: internal use
  }

  private async classifyDocumentType(
    content: string,
    baseType: string
  ): Promise<string> {

    // Expand basic type to subtype
    const subtypes: Record<string, string[]> = {
      'pdf': ['contract', 'report', 'whitepaper', 'manual', 'specification'],
      'text': ['note', 'log', 'transcript', 'readme'],
      'code': ['source', 'config', 'script', 'documentation'],
    };

    // Simple keyword matching for subtypes
    const lowerContent = content.toLowerCase();

    if (baseType === 'pdf') {
      if (lowerContent.includes('agreement') || lowerContent.includes('contract')) {
        return 'pdf-contract';
      }
      if (lowerContent.includes('quarterly report') || lowerContent.includes('annual report')) {
        return 'pdf-report';
      }
    }

    return baseType; // Return base type if no subtype detected
  }

  private async detectLanguage(content: string): Promise<string> {
    // Simple language detection (can use library like franc)
    const sample = content.slice(0, 500);

    // Basic heuristic: check for common words
    const englishWords = ['the', 'and', 'is', 'in', 'to', 'a', 'of'];
    const vietnameseWords = ['và', 'của', 'có', 'là', 'trong', 'được'];

    const lowerSample = sample.toLowerCase();

    const englishCount = englishWords.filter(w => lowerSample.includes(w)).length;
    const vietnameseCount = vietnameseWords.filter(w => lowerSample.includes(w)).length;

    if (vietnameseCount > englishCount) {
      return 'vi';
    }

    return 'en'; // Default to English
  }
}
```

**Types:**

```typescript
interface DocumentMetadata {
  author: string | null;              // Extracted author
  accessControl: AccessControlLevel;   // Access level
  documentType: string;                // Expanded type (e.g., 'pdf-contract')
  createdAt: Date;                     // From file metadata
  modifiedAt: Date;                    // From file metadata
  fileSize: number;                    // Bytes
  language: string;                    // ISO 639-1 code (en, vi, etc.)
}

type AccessControlLevel = 'public' | 'internal' | 'restricted' | 'confidential';

interface FileMetadata {
  author?: string;
  createdAt: Date;
  modifiedAt: Date;
  size: number;
  mimeType: string;
}
```

**Configuration:**

```bash
# Document Metadata Extraction
DOCUMENT_METADATA_EXTRACTION_ENABLED=true  # Default: true
DOCUMENT_METADATA_AUTHOR_EXTRACTION=true   # Extract author from content
DOCUMENT_METADATA_ACCESS_CONTROL=true      # Classify access control
DOCUMENT_METADATA_LANGUAGE_DETECTION=true  # Detect language
```

---

### ĐC-4: Updated Enrich Stage Orchestrator

**Purpose:** Integrate new enrichment features into workflow

**Updated Flow:**

```typescript
@Injectable()
export class EnrichStageService {

  constructor(
    // Existing services
    private metadataEnricher: MetadataEnricherService,
    private entityExtractor: AlgorithmicEntityExtractorService,
    private keywordExtractor: KeywordExtractorService,
    private llmEnricher: LlmEnricherService,
    private hypotheticalQuestionsGenerator: HypotheticalQuestionsGeneratorService,

    // New services
    private documentMetadataExtractor: DocumentMetadataExtractor,
    private relationExtractor: RelationExtractionService,
    private cypherGenerator: CypherGenerationService,

    private configService: ConfigService
  ) {}

  async execute(input: EnrichInputDto): Promise<EnrichOutputDto> {
    this.logger.log(`Enriching document ${input.documentId}`);

    const startTime = Date.now();

    // NEW: Extract document-level metadata first
    const documentMetadata = await this.extractDocumentMetadata(input);

    // Enrich parent chunks
    const enrichedParents = await this.enrichParentChunks(
      input.parentChunks,
      documentMetadata,
      input.sectionMetadata
    );

    // Enrich child chunks
    const enrichedChildren = await this.enrichChildChunks(
      input.childChunks,
      documentMetadata,
      input.sectionMetadata
    );

    // NEW: Extract relations for Knowledge Graph
    const graphData = await this.buildKnowledgeGraph(
      enrichedParents,
      enrichedChildren
    );

    const durationMs = Date.now() - startTime;

    return {
      enrichedParents,
      enrichedChildren,
      documentMetadata,      // NEW: Document-level metadata
      graphData,             // NEW: KG relations + Cypher
      enrichmentMetadata: {
        totalParents: enrichedParents.length,
        totalChildren: enrichedChildren.length,
        totalEntities: graphData.entities.length,
        totalRelations: graphData.relations.length,
        durationMs,
      },
      errors: [],
    };
  }

  private async extractDocumentMetadata(
    input: EnrichInputDto
  ): Promise<DocumentMetadata> {

    if (!this.configService.get('DOCUMENT_METADATA_EXTRACTION_ENABLED')) {
      return null;
    }

    const fullContent = [
      ...input.parentChunks.map(c => c.content),
      ...input.childChunks.map(c => c.content)
    ].join('\n\n');

    return this.documentMetadataExtractor.extractDocumentMetadata(
      input.fileMetadata,
      fullContent,
      input.documentType
    );
  }

  private async buildKnowledgeGraph(
    parents: EnrichedParentChunk[],
    children: EnrichedChildChunk[]
  ): Promise<GraphData> {

    if (!this.configService.get('RELATION_EXTRACTION_ENABLED')) {
      return { entities: [], relations: [], cypherQueries: [] };
    }

    const allChunks = [...parents, ...children];
    const allEntities: Entity[] = [];
    const allRelations: Relation[] = [];
    const cypherBatches: CypherBatch[] = [];

    for (const chunk of allChunks) {
      const entities = chunk.metadata.entities || [];
      allEntities.push(...entities);

      // Extract relations between entities in this chunk
      const relations = await this.relationExtractor.extractRelations(
        chunk,
        entities
      );
      allRelations.push(...relations);

      // Generate Cypher queries for this chunk
      const cypherBatch = this.cypherGenerator.generateChunkGraphNodes(
        chunk,
        entities,
        relations
      );
      cypherBatches.push(cypherBatch);
    }

    // Deduplicate entities and relations
    const uniqueEntities = this.deduplicateEntities(allEntities);
    const uniqueRelations = this.deduplicateRelations(allRelations);

    return {
      entities: uniqueEntities,
      relations: uniqueRelations,
      cypherQueries: cypherBatches.flatMap(b => b.queries),
      stats: {
        totalEntities: uniqueEntities.length,
        totalRelations: uniqueRelations.length,
        totalCypherQueries: cypherBatches.reduce((sum, b) => sum + b.totalQueries, 0),
      },
    };
  }

  private deduplicateEntities(entities: Entity[]): Entity[] {
    const seen = new Map<string, Entity>();

    for (const entity of entities) {
      const key = `${entity.type}:${entity.text.toLowerCase()}`;

      if (!seen.has(key) || seen.get(key).confidence < entity.confidence) {
        seen.set(key, entity);
      }
    }

    return Array.from(seen.values());
  }

  private deduplicateRelations(relations: Relation[]): Relation[] {
    const seen = new Map<string, Relation>();

    for (const relation of relations) {
      const key = `${relation.source}:${relation.type}:${relation.target}`.toLowerCase();

      if (!seen.has(key) || seen.get(key).confidence < relation.confidence) {
        seen.set(key, relation);
      }
    }

    return Array.from(seen.values());
  }
}
```

**Updated Output Types:**

```typescript
interface EnrichOutputDto {
  enrichedParents: EnrichedParentChunk[];
  enrichedChildren: EnrichedChildChunk[];

  // NEW: Document-level metadata
  documentMetadata: DocumentMetadata | null;

  // NEW: Knowledge Graph data
  graphData: GraphData;

  enrichmentMetadata: {
    totalParents: number;
    totalChildren: number;
    totalEntities: number;        // NEW
    totalRelations: number;       // NEW
    durationMs: number;
  };

  errors: string[];
}

interface GraphData {
  entities: Entity[];              // All unique entities
  relations: Relation[];           // All unique relations
  stats: {
    totalEntities: number;
    totalRelations: number;
    totalCypherQueries: number;
  };
}
```

---

## Implementation Plan

### Phase 1: Document Metadata (Week 1)

**Deliverables:**
- [ ] DocumentMetadataExtractor service
- [ ] Author extraction logic (file metadata + content patterns)
- [ ] Access control classification (rule-based)
- [ ] Document type expansion
- [ ] Language detection
- [ ] Unit tests
- [ ] Update EnrichStageService to use DocumentMetadataExtractor

**Dependencies:**
- Parse Stage must provide file metadata
- Load Stage must include file metadata from MinIO

**Testing:**
- Test author extraction with various document formats
- Test access control classification with sample documents
- Test language detection accuracy

---

### Phase 2: Relation Extraction (Week 2-3)

**Deliverables:**
- [ ] RelationExtractionService implementation
- [ ] Rule-based relation extraction (patterns for common relations)
- [ ] LLM-based relation extraction
- [ ] Hybrid extraction mode
- [ ] Configuration for provider/model selection
- [ ] Relation deduplication logic
- [ ] Unit tests
- [ ] Integration tests with entity extraction

**Dependencies:**
- LLMProviderFactory (already exists from v1.4)
- Entity extraction (already exists)

**Testing:**
- Test rule-based extraction with known patterns
- Test LLM extraction quality
- Test hybrid mode fallback logic
- Test deduplication

---

### Phase 3: Cypher Generation (Week 3-4)

**Deliverables:**
- [ ] CypherGenerationService implementation
- [ ] Entity node generation (MERGE logic)
- [ ] Relationship edge generation
- [ ] Chunk node generation
- [ ] MENTIONS relationship linking
- [ ] Cypher escaping and sanitization
- [ ] Batch query generation
- [ ] Unit tests

**Dependencies:**
- Relation extraction (Phase 2)

**Testing:**
- Test Cypher syntax correctness
- Test MERGE vs CREATE logic
- Test parameter escaping
- Test batch generation

---


**Deliverables:**
- [ ] Update EnrichStageService orchestrator
- [ ] Integrate all new services
- [ ] Update workflow state types
- [ ] Update Persist Stage to execute Cypher
- [ ] Integration tests
- [ ] End-to-end tests

**Dependencies:**
- All previous phases

**Testing:**
- Test full enrichment pipeline
- Test rollback on failure
- Test performance with large documents

---

### Phase 5: Optimization & Polish (Week 5-6)

**Deliverables:**
- [ ] Performance optimization (batch processing)
- [ ] Cost optimization (minimize LLM calls)
- [ ] Error handling improvements
- [ ] Logging and monitoring
- [ ] Documentation updates
- [ ] Configuration examples
- [ ] Performance benchmarks

**Testing:**
- Load testing
- Cost analysis
- Documentation review

---

## Database Schema Changes

### New Tables

#### 1. Document Metadata Table

```sql
CREATE TABLE document_metadata (
  id VARCHAR(36) PRIMARY KEY,
  document_id VARCHAR(36) NOT NULL,

  -- New fields
  author VARCHAR(255),
  access_control ENUM('public', 'internal', 'restricted', 'confidential') DEFAULT 'internal',
  document_type VARCHAR(100),
  language VARCHAR(10),

  -- File metadata
  file_size BIGINT,
  created_at TIMESTAMP,
  modified_at TIMESTAMP,

  -- Tracking
  extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (document_id) REFERENCES indexing_jobs(document_id),
  INDEX idx_document_id (document_id),
  INDEX idx_access_control (access_control),
  INDEX idx_author (author)
);
```

#### 2. Knowledge Graph Relations Table

```sql
CREATE TABLE kg_relations (
  id VARCHAR(36) PRIMARY KEY,
  document_id VARCHAR(36) NOT NULL,
  chunk_id VARCHAR(36) NOT NULL,

  -- Relation data
  source_entity VARCHAR(500) NOT NULL,
  relation_type VARCHAR(100) NOT NULL,
  target_entity VARCHAR(500) NOT NULL,
  confidence DECIMAL(3, 2),

  -- Metadata
  extraction_method ENUM('llm', 'rule-based') DEFAULT 'rule-based',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (document_id) REFERENCES indexing_jobs(document_id),
  INDEX idx_document_id (document_id),
  INDEX idx_chunk_id (chunk_id),
  INDEX idx_source_entity (source_entity(255)),
  INDEX idx_target_entity (target_entity(255)),
  INDEX idx_relation_type (relation_type)
);
```

#### 3. Cypher Query Log Table (for debugging)

```sql
CREATE TABLE cypher_query_log (
  id VARCHAR(36) PRIMARY KEY,
  document_id VARCHAR(36) NOT NULL,
  chunk_id VARCHAR(36),

  -- Query data
  query_text TEXT NOT NULL,
  query_params JSON,
  execution_status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
  error_message TEXT,

  -- Performance
  execution_time_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  executed_at TIMESTAMP,

  INDEX idx_document_id (document_id),
  INDEX idx_status (execution_status)
);
```

---

## Dependencies & Integration

### Updated Workflow State

```typescript
interface IndexingStateType {
  // ... existing fields ...

  // NEW: Document metadata
  documentMetadata?: DocumentMetadata;

  // NEW: Knowledge Graph data
  graphData?: GraphData;

  // Updated metrics
  metrics: {
    // ... existing metrics ...
    entitiesExtracted: number;    // NEW
    relationsExtracted: number;   // NEW
    cypherQueriesGenerated: number; // NEW
  };
}
```

### Integration Points

**1. Load Stage → Enrich Stage:**
- Must provide file metadata (author, timestamps, size)

**2. Enrich Stage → Persist Stage:**
- NEW: Pass `graphData` with Cypher queries
- NEW: Pass `documentMetadata`

**3. Enrich Stage → Embed Stage:**
- No changes needed (embeddings don't depend on relations)

---

## Testing Strategy

### Unit Tests

**Coverage Target:** 90%

**Test Cases:**

1. **DocumentMetadataExtractor:**
   - Extract author from file metadata
   - Extract author from content patterns
   - Classify access control correctly
   - Detect language accurately
   - Handle missing metadata gracefully

2. **RelationExtractionService:**
   - Extract relations with LLM
   - Extract relations with rules
   - Hybrid mode fallback logic
   - Parse LLM responses correctly
   - Handle extraction errors

3. **CypherGenerationService:**
   - Generate entity nodes correctly
   - Generate relationships correctly
   - MERGE vs CREATE logic
   - Parameter escaping
   - Batch generation

### Integration Tests

**Test Cases:**

1. **Full Enrichment Pipeline:**
   - Enrich document with all features enabled
   - Verify all metadata fields populated
   - Verify entities and relations extracted
   - Verify Cypher queries generated

   - Execute Cypher queries successfully
   - Verify graph nodes created
   - Verify relationships created
   - Rollback on errors

3. **Error Scenarios:**
   - LLM relation extraction fails → fallback to rules
   - Invalid Cypher → proper error handling

---

## Success Metrics

### Functional Metrics

- ✅ 100% of documents have author field populated (or null if unknown)
- ✅ 100% of documents have access control classification
- ✅ >80% of entities have at least one relation (if RELATION_EXTRACTION_ENABLED)
- ✅ >90% of Cypher queries execute successfully
- ✅ Knowledge Graph contains all entities and relations

### Quality Metrics

- ✅ Relation extraction accuracy >70% (compared to manual labeling)
- ✅ Author extraction accuracy >85% (when author present)
- ✅ Access control classification accuracy >80%

### Performance Metrics

- ✅ Relation extraction: <2s per chunk (LLM mode)
- ✅ Relation extraction: <100ms per chunk (rule-based mode)
- ✅ Cypher generation: <50ms per chunk

### Cost Metrics

- ✅ LLM relation extraction: <$0.0003 per chunk (with gpt-4o-mini)
- ✅ Rule-based relation extraction: $0 (free)

---

## Risks & Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLM relation extraction quality low | Medium | High | Hybrid mode with rule-based fallback |
| Cypher query generation bugs | Low | High | Comprehensive testing, sanitization |
| Author extraction accuracy low | High | Low | Multiple extraction methods, fallback |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| High LLM costs for relation extraction | Medium | Medium | Default to rule-based, opt-in LLM |
| Complex configuration | Medium | Low | Good documentation, sensible defaults |

---

## Configuration Examples

### Example 1: Full KG with LLM (High Quality)

```bash
# Document Metadata
DOCUMENT_METADATA_EXTRACTION_ENABLED=true
DOCUMENT_METADATA_AUTHOR_EXTRACTION=true
DOCUMENT_METADATA_ACCESS_CONTROL=true

# Relation Extraction - LLM
RELATION_EXTRACTION_ENABLED=true
RELATION_EXTRACTION_METHOD=llm
RELATION_EXTRACTION_PROVIDER=openai
RELATION_EXTRACTION_MODEL=gpt-4o-mini
RELATION_EXTRACTION_TEMPERATURE=0.3

# Knowledge Graph
NEO4J_ENABLED=true
```

### Example 2: KG with Rule-Based (Fast & Free)

```bash
# Document Metadata
DOCUMENT_METADATA_EXTRACTION_ENABLED=true

# Relation Extraction - Rule-based
RELATION_EXTRACTION_ENABLED=true
RELATION_EXTRACTION_METHOD=rule-based

# Knowledge Graph
NEO4J_ENABLED=true
```

### Example 3: Hybrid (Best of Both)

```bash
# Document Metadata
DOCUMENT_METADATA_EXTRACTION_ENABLED=true

# Relation Extraction - Hybrid
RELATION_EXTRACTION_ENABLED=true
RELATION_EXTRACTION_METHOD=hybrid
RELATION_EXTRACTION_PROVIDER=openai
RELATION_EXTRACTION_MODEL=gpt-4o-mini

# Knowledge Graph
NEO4J_ENABLED=true
```

### Example 4: Minimal (No KG)

```bash
# Document Metadata only
DOCUMENT_METADATA_EXTRACTION_ENABLED=true

# No relation extraction
RELATION_EXTRACTION_ENABLED=false

NEO4J_ENABLED=false
```

---

## Appendix A: Relation Types Reference

| Relation Type | Description | Example |
|--------------|-------------|---------|
| WORKS_FOR | Person employed by organization | "John WORKS_FOR Microsoft" |
| EMPLOYED_BY | Inverse of WORKS_FOR | "Microsoft EMPLOYED_BY John" |
| LOCATED_IN | Entity in location | "Microsoft LOCATED_IN Seattle" |
| BASED_IN | Similar to LOCATED_IN | "Company BASED_IN California" |
| PART_OF | Entity is component | "Engineering PART_OF Microsoft" |
| BELONGS_TO | Ownership | "Product BELONGS_TO Company" |
| RELATED_TO | Generic relationship | "AI RELATED_TO Machine Learning" |
| MENTIONS | Document mentions entity | "Chunk MENTIONS Microsoft" |
| CONTAINS | Container relationship | "Report CONTAINS Analysis" |
| REFERENCES | Citation | "Paper REFERENCES Study" |
| AUTHOR_OF | Authorship | "John AUTHOR_OF Paper" |
| CREATED_BY | Creation | "Document CREATED_BY John" |
| OWNED_BY | Ownership | "Asset OWNED_BY Company" |

---


### Node Types

```cypher
// Document node
(:Document {
  id: String,
  filename: String,
  documentType: String,
  author: String,
  accessControl: String,
  createdAt: Timestamp
})

// Chunk node
(:Chunk {
  id: String,
  content: Text,
  tokens: Integer,
  sectionPath: String
})

// Entity nodes (by type)
(:Person {text: String, confidence: Float})
(:Organization {text: String, confidence: Float})
(:Location {text: String, confidence: Float})
(:Concept {text: String, confidence: Float})
// ... other entity types
```

### Relationship Types

```cypher
// Document-Chunk relationship
(:Document)-[:CONTAINS]->(:Chunk)

// Chunk-Entity relationship
(:Chunk)-[:MENTIONS]->(:Entity)

// Entity-Entity relationships
(:Person)-[:WORKS_FOR]->(:Organization)
(:Organization)-[:LOCATED_IN]->(:Location)
(:Entity)-[:RELATED_TO]->(:Entity)
// ... other relation types
```

---

## Conclusion

This improvement plan addresses the gaps identified between the current Enrich Stage plan (v1.4) and the system architecture diagram. The key additions are:

1. **✅ Knowledge Graph Construction** - Relation extraction and Cypher generation
2. **✅ Document-Level Metadata** - Author and access control

**Implementation Priority:**
1. **P0:** Relation extraction + Cypher generation (core KG functionality)
2. **P1:** Document metadata extraction (important for compliance)
3. **P2:** Optimization and polish

**Recommended Approach:** Implement in phases with MVP first (rule-based relations) and advanced features (LLM relations) later.

---

**Status:** Draft
**Next Review:** 2025-11-10
**Version History:**
- v1.0 (2025-11-04): Initial improvement plan based on gap analysis

---

**End of Document**
