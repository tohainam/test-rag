# Kế Hoạch Triển Khai Enrich Stage

**Phiên bản:** 1.4
**Cập nhật lần cuối:** 2025-11-04
**Trạng thái:** Nháp
**Giai đoạn:** 5/7 (Enrich)

---

## Mục lục

1. [Tổng quan](#tổng-quan)
2. [Yêu cầu nghiệp vụ](#yêu-cầu-nghiệp-vụ)
3. [Đặc tả chức năng](#đặc-tả-chức-năng)
4. [Phương pháp kỹ thuật](#phương-pháp-kỹ-thuật)
5. [Điểm tích hợp](#điểm-tích-hợp)
6. [Luồng dữ liệu](#luồng-dữ-liệu)
7. [Chiến lược xử lý lỗi](#chiến-lược-xử-lý-lỗi)
8. [Yêu cầu hiệu năng](#yêu-cầu-hiệu-năng)
9. [Chiến lược kiểm thử](#chiến-lược-kiểm-thử)
10. [Tiêu chí thành công](#tiêu-chí-thành-công)
11. [Các giai đoạn triển khai](#các-giai-đoạn-triển-khai)
12. [Phụ thuộc & Rủi ro](#phụ-thuộc--rủi-ro)

---

## Tổng quan

### Mục đích

Enrich Stage là **giai đoạn thứ 5 trong pipeline indexing** (7 giai đoạn), chịu trách nhiệm làm giàu metadata và thêm thông tin ngữ nghĩa vào chunks để cải thiện chất lượng retrieval.

**Vị trí trong pipeline:**
```
Load → Parse → Structure → Chunk → [ENRICH] → Embed → Persist
                                      ^^^^
                                  Giai đoạn này
```

**Chức năng chính:**
- Thêm metadata phân cấp (hierarchical metadata)
- Trích xuất entities (algorithmic-based, không dùng LLM)
- **Tùy chọn:** Tạo tóm tắt và keywords (LLM-based, configurable)
- **Tùy chọn:** Generate hypothetical questions (Multi-Vector Retrieval)
- Bảo toàn toàn bộ chunks (không modify content)

### Nguyên tắc thiết kế

**Enrich Stage KHÔNG modify content - CHỈ thêm metadata:**

```
Input:
{
  id: "chunk-123",
  content: "This is about machine learning...",
  tokens: 512,
  metadata: { sectionPath: "Chapter 1 > Introduction" }
}

Output (Enriched):
{
  id: "chunk-123",
  content: "This is about machine learning...",  // ✅ KHÔNG THAY ĐỔI
  tokens: 512,                                    // ✅ KHÔNG THAY ĐỔI
  metadata: {
    sectionPath: "Chapter 1 > Introduction",

    // ✅ Metadata mới được THÊM VÀO
    entities: [
      { text: "machine learning", type: "CONCEPT", confidence: 0.9 }
    ],
    keywords: ["machine learning", "AI", "algorithms"],        // Optional
    summary: "Brief overview of ML concepts",                   // Optional
    hypotheticalQuestions: [                                    // Optional
      "What is machine learning?",
      "How does machine learning work?",
      "What are the main algorithms in machine learning?"
    ]
  }
}
```

### Phạm vi

**Trong phạm vi:**
- ✅ Thêm hierarchical metadata (sectionPath, pageNumber, document hierarchy)
- ✅ Trích xuất entities bằng **algorithmic methods** (pattern matching, NLP libraries)
- ✅ **Tùy chọn:** Generate summaries với LLM (configurable, off by default)
- ✅ **Tùy chọn:** Extract keywords với TF-IDF hoặc LLM
- ✅ **Tùy chọn:** Generate hypothetical questions với LLM (Multi-Vector Retrieval)
- ✅ Validate metadata consistency
- ✅ Xử lý gracefully khi enrichment fails (không fail toàn bộ job)

**Ngoài phạm vi:**
- ❌ Modify chunk content
- ❌ Re-chunk documents (đã làm ở Chunk Stage)
- ❌ Generate embeddings (→ Embed Stage)
- ❌ Store enriched chunks (→ Persist Stage)
- ❌ Fine-tuning models
- ❌ Custom NER training

### Giá trị nghiệp vụ

1. **Retrieval accuracy:** Metadata giúp filter và rank results chính xác hơn
2. **Context preservation:** Hierarchical metadata giúp LLM hiểu vị trí chunk trong document
3. **Semantic enrichment:** Entities và keywords cải thiện search quality
4. **Flexibility:** Algorithmic (fast, free) + Optional LLM (high quality, có chi phí)
5. **Scalability:** Không bắt buộc dùng LLM → Chi phí thấp, tốc độ cao

---

## Yêu cầu nghiệp vụ

### YN-1: Làm giàu Hierarchical Metadata

**Độ ưu tiên:** P0 (Cực kỳ quan trọng)

**Mô tả:**
Hệ thống phải thêm metadata phân cấp vào mỗi chunk để bảo toàn ngữ cảnh tài liệu.

**Tiêu chí chấp nhận:**
- ✅ Mỗi chunk có `sectionPath` (breadcrumb từ Structure Stage)
- ✅ Mỗi chunk có `documentId`, `fileId`, `filename`
- ✅ Parent chunks có `childChunkIds` (danh sách children)
- ✅ Child chunks có `parentChunkId`
- ✅ Nếu có `pageNumber` từ PDF → giữ lại
- ✅ Nếu có `lineNumber` từ text files → giữ lại
- ✅ Thêm timestamp: `enrichedAt`

**Implementation:**
```typescript
interface HierarchicalMetadata {
  // Document context
  documentId: string;
  fileId: string;
  filename: string;
  documentType: 'pdf' | 'docx' | 'text' | 'code' | 'markdown';

  // Section context
  sectionPath: string;  // "Chapter 1 > Section 1.1 > Subsection 1.1.1"
  sectionLevel: number;  // 3 (depth in hierarchy)

  // Page/line context (if available)
  pageNumber?: number;
  lineNumberStart?: number;
  lineNumberEnd?: number;

  // Chunk hierarchy
  parentChunkId?: string;      // For child chunks
  childChunkIds?: string[];    // For parent chunks
  chunkIndex: number;          // Position in parent/section

  // Timestamps
  enrichedAt: Date;
}
```

**Tác động nghiệp vụ:**
- LLM có thể hiểu chunk thuộc phần nào của tài liệu
- Users có thể navigate qua document outline
- Filtering results theo sections

---

### YN-2: Trích xuất Entities (Algorithmic)

**Độ ưu tiên:** P1 (Cao)

**Mô tả:**
Hệ thống phải trích xuất named entities bằng **algorithmic methods** (không dùng LLM) để tiết kiệm chi phí.

**Tiêu chí chấp nhận:**
- ✅ Phát hiện **capitalized phrases** (proper nouns): "John Smith", "Microsoft Corporation"
- ✅ Phát hiện **numeric patterns**: dates ("2024-11-04"), numbers ("$1,000,000")
- ✅ Phát hiện **email addresses** và **URLs**
- ✅ **Tùy chọn:** Sử dụng NLP libraries (compromise.js, natural) cho better entity recognition
- ✅ Mỗi entity có `type`, `text`, `confidence`, `offsets`
- ✅ Không duplicate entities trong cùng chunk
- ✅ Graceful degradation: Nếu extraction fails → chunk vẫn proceed với empty entities array

**Entity Types:**
```typescript
type EntityType =
  | 'PERSON'           // John Smith
  | 'ORGANIZATION'     // Microsoft Corporation
  | 'LOCATION'         // New York City
  | 'DATE'             // 2024-11-04
  | 'MONEY'            // $1,000,000
  | 'PERCENT'          // 25%
  | 'EMAIL'            // user@example.com
  | 'URL'              // https://example.com
  | 'PHONE'            // +1-234-567-8900
  | 'CONCEPT';         // machine learning (technical terms)

interface Entity {
  type: EntityType;
  text: string;
  confidence: number;  // 0.0 - 1.0
  offsets?: [number, number][];  // Character positions in chunk
}
```

**Algorithmic Extraction Methods:**

**1. Pattern-based (Regex):**
```typescript
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b/g;
const PHONE_REGEX = /\+?[\d\s\-\(\)]{10,}/g;
const DATE_REGEX = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;
const MONEY_REGEX = /\$[\d,]+(\.\d{2})?|\d+\s?(USD|EUR|GBP)/g;
const PERCENT_REGEX = /\d+(\.\d+)?%/g;
```

**2. Capitalization-based:**
```typescript
// Proper nouns: 2+ consecutive capitalized words
// "John Smith", "Microsoft Corporation"
const PROPER_NOUN_REGEX = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
```

**3. NLP Library (compromise.js):**
```typescript
import nlp from 'compromise';

const doc = nlp(chunkContent);

const people = doc.people().out('array');          // PERSON
const places = doc.places().out('array');          // LOCATION
const organizations = doc.organizations().out('array'); // ORGANIZATION
```

**Tác động nghiệp vụ:**
- Miễn phí, nhanh (< 10ms per chunk)
- Không cần API calls
- Chất lượng ổn (~70-80% accuracy cho English)

---

### YN-3: Tóm tắt Chunks (Optional, LLM-based)

**Độ ưu tiên:** P2 (Tùy chọn)

**Mô tả:**
Hệ thống **có thể** tạo tóm tắt 2-3 câu cho parent chunks bằng LLM (configurable, off by default).

**Tiêu chí chấp nhận:**
- ✅ **Chỉ áp dụng cho parent chunks** (child chunks quá nhỏ, không cần)
- ✅ Configurable: `LLM_ENRICHMENT_ENABLED=true|false` (default: false)
- ✅ Tóm tắt: 2-3 câu, max 100 words
- ✅ Batch processing: Gửi nhiều chunks cùng lúc để tối ưu chi phí
- ✅ Timeout: 30 giây per batch
- ✅ Fallback: Nếu LLM fails → skip summary, không fail chunk
- ✅ Cost tracking: Log số tokens consumed

**Implementation:**
```typescript
interface SummaryConfig {
  enabled: boolean;              // Default: false
  model: string;                 // Default: 'gpt-3.5-turbo'
  maxTokens: number;             // Default: 100
  batchSize: number;             // Default: 10 chunks per request
  temperature: number;           // Default: 0.3 (deterministic)
  timeout: number;               // Default: 30000ms
}

interface SummaryResult {
  summary: string;               // "This section discusses..."
  tokensUsed: number;
  durationMs: number;
}
```

**Prompt Template:**
```
Summarize the following text in 2-3 sentences, focusing on the main idea:

{chunk.content}

Summary:
```

**Tác động nghiệp vụ:**
- Cải thiện search results (summary có thể được index)
- Users có thể đọc summary trước khi đọc full chunk
- **Trade-off:** Chi phí cao (~$0.001 per chunk), chậm hơn (~500ms per chunk)

**Recommendation:**
- ❌ Không bật mặc định
- ✅ Chỉ bật cho high-value documents (legal, medical)
- ✅ Hoặc để users chọn có muốn summary hay không

---

### YN-4: Trích xuất Keywords (Optional)

**Độ ưu tiên:** P2 (Tùy chọn)

**Mô tả:**
Hệ thống **có thể** trích xuất top keywords từ chunk bằng **TF-IDF hoặc LLM**.

**Tiêu chí chấp nhận:**
- ✅ **Algorithmic method (TF-IDF):** Fast, free, ổn định
- ✅ **LLM method:** Chất lượng cao hơn nhưng có chi phí
- ✅ Configurable: `KEYWORD_EXTRACTION_METHOD=tfidf|llm|none` (default: tfidf)
- ✅ Extract top 5-10 keywords per chunk
- ✅ Keywords được normalize (lowercase, deduplicate)
- ✅ Fallback: Nếu extraction fails → empty keywords array

**TF-IDF Approach:**
```typescript
import * as natural from 'natural';

const TfIdf = natural.TfIdf;
const tfidf = new TfIdf();

// Add all chunks to corpus
chunks.forEach(chunk => tfidf.addDocument(chunk.content));

// Extract keywords for each chunk
const keywords: string[] = [];
tfidf.listTerms(chunkIndex).slice(0, 10).forEach(item => {
  keywords.push(item.term);
});
```

**Ưu điểm TF-IDF:**
- ✅ Miễn phí
- ✅ Nhanh (<5ms per chunk)
- ✅ Deterministic
- ✅ Không cần external API

**LLM Approach (Optional):**
```
Extract 5-10 most important keywords from this text:

{chunk.content}

Keywords (comma-separated):
```

**Tác động nghiệp vụ:**
- Keywords giúp filter và search
- Có thể build keyword-based indexes
- Trade-off: TF-IDF vs LLM (speed/cost vs quality)

---

### YN-5: Generate Hypothetical Questions (Optional, Multi-Vector)

**Độ ưu tiên:** P2 (Tùy chọn)

**Mô tả:**
Hệ thống **có thể** tạo hypothetical questions cho parent chunks bằng LLM để cải thiện retrieval accuracy (Multi-Vector Retrieval pattern).

**Lý do & Lợi ích:**

**Vấn đề:** User queries thường là câu hỏi ("What is X?", "How to Y?"), nhưng document chunks thường là statements ("X is...", "To Y, you need..."). Semantic similarity giữa question và statement thấp hơn question-to-question.

**Giải pháp:** Generate hypothetical questions mà chunk có thể trả lời → Embed questions → Match user query với hypothetical questions → Return original chunk content.

**Ví dụ:**
```
Original Chunk Content:
"Machine learning is a subset of artificial intelligence that enables
systems to learn and improve from experience without being explicitly
programmed. It uses algorithms to identify patterns in data."

Hypothetical Questions Generated:
1. "What is machine learning?"
2. "How does machine learning work?"
3. "What's the difference between ML and AI?"
4. "How do ML systems learn from data?"

User Query: "What's machine learning?"
→ Matches question #1 với high similarity
→ Returns original chunk content
```

**Tiêu chí chấp nhận:**
- ✅ **Chỉ áp dụng cho parent chunks** (child chunks quá nhỏ)
- ✅ Configurable: `HYPOTHETICAL_QUESTIONS_ENABLED=true|false` (default: false)
- ✅ Generate 3-5 questions per parent chunk
- ✅ Questions phải:
  - Ngắn gọn (< 20 words)
  - Specific về nội dung chunk
  - Đa dạng (different angles)
  - Valid questions (có dấu ?)
- ✅ Batch processing: 10 chunks per LLM request
- ✅ Timeout: 30 giây per batch
- ✅ Fallback: Nếu LLM fails → skip questions, không fail chunk
- ✅ Cost tracking: Log tokens consumed

**Implementation Strategy:**

**Option 1: Store separately (Recommended):**
```typescript
// Parent chunks table: content chính
parent_chunks: { id, content, ... }

// Hypothetical questions table: questions generated
hypothetical_questions: {
  id,
  parent_chunk_id,  // FK to parent_chunks
  question: string,
  question_index: number  // 0-4
}

// Embed Stage:
// - Embed parent_chunks.content → Qdrant collection "chunks"
// - Embed hypothetical_questions.question → Qdrant collection "questions"

// Retrieval:
// 1. Search collection "questions" → Get question IDs
// 2. JOIN to get parent_chunk_id
// 3. Return parent chunks
```

**Option 2: Store in metadata (Alternative):**
```typescript
parentChunk.metadata.hypotheticalQuestions = [
  "What is machine learning?",
  "How does ML work?",
  "What are ML algorithms?"
]

// Embed Stage sẽ:
// 1. Embed chunk content
// 2. Embed each hypothetical question
// 3. Store all embeddings với same parent_chunk_id
```

**LLM Prompt Template:**
```
Generate 3-5 specific questions that this text chunk could answer.
Questions should be:
- Short (< 20 words)
- Specific to the content
- From different angles
- Actual questions (end with ?)

Text Chunk:
{chunk.content}

Questions (one per line):
1.
2.
3.
```

**Tác động nghiệp vụ:**
- **Cải thiện retrieval accuracy:** Query-to-question matching > query-to-statement
- **Tốt cho Q&A use cases:** Hệ thống trả lời câu hỏi users
- **Trade-off:**
  - ✅ Pros: Retrieval quality tăng 10-20%
  - ❌ Cons: Chi phí LLM cao (~$0.002 per chunk), thời gian tăng (~1s per chunk)
  - ❌ Storage: Tăng 3-5x embeddings (3-5 questions per chunk)

**Recommendation:**
- ❌ Không bật mặc định (chi phí cao)
- ✅ Cho phép users opt-in per document
- ✅ Hoặc chỉ bật cho critical documents (legal, medical, FAQs)

---

### YN-6: Validation & Error Handling

**Độ ưu tiên:** P0 (Cực kỳ quan trọng)

**Mô tả:**
Hệ thống phải validate enriched metadata và xử lý lỗi gracefully.

**Tiêu chí chấp nhận:**
- ✅ **Không modify chunk content:** Validate content unchanged
- ✅ **Metadata consistency:** Validate tất cả required fields present
- ✅ **Entity validation:** Validate entity types, text, confidence
- ✅ **Graceful degradation:** Nếu một enrichment method fails → tiếp tục với methods khác
- ✅ **Partial success:** Nếu entity extraction fails nhưng metadata OK → chunk vẫn proceed
- ✅ **Logging:** Log tất cả enrichment failures với context
- ✅ **Không fail toàn bộ job:** Nếu 1 chunk fails → tiếp tục chunks khác

**Validation Logic:**
```typescript
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

function validateEnrichedChunk(
  original: Chunk,
  enriched: EnrichedChunk
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Critical: Content must be unchanged
  if (original.content !== enriched.content) {
    errors.push('Content was modified during enrichment');
  }

  // Critical: Token count must match
  if (original.tokens !== enriched.tokens) {
    errors.push('Token count changed during enrichment');
  }

  // Required metadata
  if (!enriched.metadata.documentId) {
    errors.push('Missing documentId');
  }
  if (!enriched.metadata.sectionPath) {
    errors.push('Missing sectionPath');
  }

  // Validate entities
  enriched.metadata.entities?.forEach((entity, idx) => {
    if (!entity.type || !entity.text) {
      warnings.push(`Entity ${idx} missing type or text`);
    }
    if (entity.confidence < 0 || entity.confidence > 1) {
      warnings.push(`Entity ${idx} has invalid confidence: ${entity.confidence}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
```

---

## Đặc tả chức năng

### ĐC-1: Metadata Enricher Service

**Mục đích:** Thêm hierarchical metadata vào chunks

**Implementation:**

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class MetadataEnricherService {

  enrichMetadata(
    chunk: ParentChunk | ChildChunk,
    documentMetadata: DocumentMetadata,
    sectionMetadata: SectionMetadata
  ): EnrichedMetadata {

    return {
      // Document context
      documentId: chunk.documentId,
      fileId: chunk.fileId,
      filename: documentMetadata.filename,
      documentType: documentMetadata.documentType,

      // Section context (from Structure Stage)
      sectionPath: sectionMetadata.sectionPath,
      sectionLevel: sectionMetadata.level,

      // Page/line context (if available)
      pageNumber: sectionMetadata.pageNumber,
      lineNumberStart: sectionMetadata.lineNumberStart,
      lineNumberEnd: sectionMetadata.lineNumberEnd,

      // Chunk hierarchy
      parentChunkId: (chunk as ChildChunk).parentChunkId,
      chunkIndex: chunk.chunkIndex,

      // Timestamps
      enrichedAt: new Date(),

      // Placeholders for other enrichments
      entities: [],
      keywords: [],
      summary: undefined
    };
  }
}
```

---

### ĐC-2: Algorithmic Entity Extractor

**Mục đích:** Trích xuất entities bằng pattern matching và NLP libraries

**Implementation:**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import nlp from 'compromise';

@Injectable()
export class AlgorithmicEntityExtractorService {
  private readonly logger = new Logger(AlgorithmicEntityExtractorService.name);

  extractEntities(content: string): Entity[] {
    const entities: Entity[] = [];

    try {
      // 1. Pattern-based extraction (regex)
      entities.push(...this.extractEmails(content));
      entities.push(...this.extractUrls(content));
      entities.push(...this.extractPhones(content));
      entities.push(...this.extractDates(content));
      entities.push(...this.extractMoney(content));
      entities.push(...this.extractPercents(content));

      // 2. NLP-based extraction (compromise.js)
      entities.push(...this.extractNlpEntities(content));

      // 3. Deduplicate by text
      const deduplicated = this.deduplicateEntities(entities);

      return deduplicated;

    } catch (error) {
      this.logger.error('Entity extraction failed:', error);
      return [];  // Graceful degradation
    }
  }

  private extractEmails(content: string): Entity[] {
    const regex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const matches = content.match(regex) || [];

    return matches.map(text => ({
      type: 'EMAIL',
      text,
      confidence: 1.0,  // High confidence for regex
    }));
  }

  private extractUrls(content: string): Entity[] {
    const regex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
    const matches = content.match(regex) || [];

    return matches.map(text => ({
      type: 'URL',
      text,
      confidence: 1.0,
    }));
  }

  private extractPhones(content: string): Entity[] {
    const regex = /\+?[\d\s\-\(\)]{10,}/g;
    const matches = content.match(regex) || [];

    return matches
      .filter(text => text.replace(/\D/g, '').length >= 10)  // At least 10 digits
      .map(text => ({
        type: 'PHONE',
        text,
        confidence: 0.8,  // Medium confidence (false positives possible)
      }));
  }

  private extractDates(content: string): Entity[] {
    const regex = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi;
    const matches = content.match(regex) || [];

    return matches.map(text => ({
      type: 'DATE',
      text,
      confidence: 0.9,
    }));
  }

  private extractMoney(content: string): Entity[] {
    const regex = /\$[\d,]+(\.\d{2})?|\d+\s?(USD|EUR|GBP|JPY|CNY)/gi;
    const matches = content.match(regex) || [];

    return matches.map(text => ({
      type: 'MONEY',
      text,
      confidence: 0.9,
    }));
  }

  private extractPercents(content: string): Entity[] {
    const regex = /\d+(\.\d+)?%/g;
    const matches = content.match(regex) || [];

    return matches.map(text => ({
      type: 'PERCENT',
      text,
      confidence: 1.0,
    }));
  }

  private extractNlpEntities(content: string): Entity[] {
    const doc = nlp(content);
    const entities: Entity[] = [];

    // People
    const people = doc.people().out('array');
    people.forEach(text => {
      entities.push({
        type: 'PERSON',
        text,
        confidence: 0.7,  // NLP confidence varies
      });
    });

    // Places
    const places = doc.places().out('array');
    places.forEach(text => {
      entities.push({
        type: 'LOCATION',
        text,
        confidence: 0.7,
      });
    });

    // Organizations
    const organizations = doc.organizations().out('array');
    organizations.forEach(text => {
      entities.push({
        type: 'ORGANIZATION',
        text,
        confidence: 0.7,
      });
    });

    return entities;
  }

  private deduplicateEntities(entities: Entity[]): Entity[] {
    const seen = new Set<string>();
    const deduplicated: Entity[] = [];

    for (const entity of entities) {
      const key = `${entity.type}:${entity.text.toLowerCase()}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(entity);
      }
    }

    return deduplicated;
  }
}
```

---

### ĐC-3: Keyword Extractor (TF-IDF)

**Mục đích:** Trích xuất keywords bằng TF-IDF

**Implementation:**

```typescript
import { Injectable } from '@nestjs/common';
import * as natural from 'natural';

@Injectable()
export class KeywordExtractorService {
  private readonly TOP_K = 10;

  extractKeywords(
    chunks: EnrichedChunk[],
    targetChunkIndex: number
  ): string[] {
    try {
      const TfIdf = natural.TfIdf;
      const tfidf = new TfIdf();

      // Add all chunks to corpus
      chunks.forEach(chunk => {
        tfidf.addDocument(this.preprocessText(chunk.content));
      });

      // Extract top keywords for target chunk
      const keywords: string[] = [];
      tfidf.listTerms(targetChunkIndex)
        .slice(0, this.TOP_K)
        .forEach(item => {
          keywords.push(item.term);
        });

      return keywords;

    } catch (error) {
      return [];  // Graceful degradation
    }
  }

  private preprocessText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Remove punctuation
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();
  }
}
```

---

### ĐC-4: Hypothetical Questions Generator (Optional)

**Mục đích:** Generate hypothetical questions cho Multi-Vector Retrieval

**Implementation:**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

@Injectable()
export class HypotheticalQuestionsGeneratorService {
  private readonly logger = new Logger(HypotheticalQuestionsGeneratorService.name);
  private model: BaseChatModel | null = null;

  constructor(
    private configService: ConfigService,
    private llmProviderFactory: LLMProviderFactory
  ) {
    const enabled = this.configService.get('HYPOTHETICAL_QUESTIONS_ENABLED');

    if (enabled) {
      // Sử dụng factory để tạo model
      // Priority: HYPOTHETICAL_QUESTIONS_PROVIDER → LLM_PROVIDER (global)
      const specificProvider = this.configService.get<LLMProvider>('HYPOTHETICAL_QUESTIONS_PROVIDER');
      const provider = specificProvider || this.configService.get<LLMProvider>('LLM_PROVIDER');

      // Priority: HYPOTHETICAL_QUESTIONS_MODEL → Provider's default model
      const specificModel = this.configService.get('HYPOTHETICAL_QUESTIONS_MODEL');

      // Temperature cao hơn (0.7) để tạo questions đa dạng
      this.model = this.llmProviderFactory.createChatModel(
        provider,  // Use specific provider or global default
        {
          model: specificModel,  // Override model nếu được set
          temperature: this.configService.get('HYPOTHETICAL_QUESTIONS_TEMPERATURE') || 0.7,
          maxTokens: this.configService.get('HYPOTHETICAL_QUESTIONS_MAX_TOKENS') || 150,
        }
      );

      this.logger.log(
        `Hypothetical questions using provider: ${provider || 'default'}` +
        (specificModel ? `, model: ${specificModel}` : '')
      );
    }
  }

  async generateQuestions(
    chunk: ParentChunk
  ): Promise<HypotheticalQuestionsResult | null> {
    if (!this.model) {
      return null;  // Feature disabled
    }

    try {
      const startTime = Date.now();

      const prompt = ChatPromptTemplate.fromMessages([
        ['system', 'You are a question generation expert. Generate specific, diverse questions that the given text could answer.'],
        ['user', `Generate 3-5 specific questions that this text chunk could answer.

Requirements:
- Short (< 20 words each)
- Specific to the content
- From different angles
- Must end with ?
- One question per line

Text Chunk:
{content}

Questions (numbered list):`]
      ]);

      const chain = prompt.pipe(this.model);
      const response = await chain.invoke({
        content: chunk.content
      });

      const questions = this.parseQuestions(response.content.toString());
      const durationMs = Date.now() - startTime;

      // Estimate tokens
      const tokensUsed = Math.ceil(
        (chunk.content.length + response.content.toString().length) / 4
      );

      return {
        questions,
        tokensUsed,
        durationMs
      };

    } catch (error) {
      this.logger.error(`Failed to generate questions for chunk ${chunk.id}:`, error);
      return null;  // Graceful degradation
    }
  }

  async batchGenerateQuestions(
    chunks: ParentChunk[]
  ): Promise<Map<string, HypotheticalQuestionsResult>> {
    const results = new Map<string, HypotheticalQuestionsResult>();

    // Process in batches to optimize API calls
    const batchSize = 10;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async chunk => {
          const result = await this.generateQuestions(chunk);
          if (result && result.questions.length > 0) {
            results.set(chunk.id, result);
          }
        })
      );
    }

    this.logger.log(
      `Generated hypothetical questions for ${results.size}/${chunks.length} chunks`
    );

    return results;
  }

  private parseQuestions(response: string): string[] {
    const questions: string[] = [];

    // Parse numbered list format
    const lines = response.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Match patterns like:
      // "1. Question?"
      // "1) Question?"
      // "- Question?"
      const match = /^[\d\-\*\)\.]+\s*(.+\?)$/.exec(trimmed);

      if (match) {
        const question = match[1].trim();

        // Validate question
        if (
          question.length > 10 &&          // Not too short
          question.length < 150 &&         // Not too long (< 20 words)
          question.endsWith('?') &&        // Valid question
          this.countWords(question) <= 20  // Word limit
        ) {
          questions.push(question);
        }
      }
    }

    // Limit to 5 questions max
    return questions.slice(0, 5);
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
}

interface HypotheticalQuestionsResult {
  questions: string[];  // 3-5 questions
  tokensUsed: number;
  durationMs: number;
}
```

---

### ĐC-5: LLM Provider Factory

**Mục đích:** Tạo factory pattern để dễ dàng switch giữa các LLM providers

**Implementation:**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/ollama';
import { OllamaEmbeddings } from '@langchain/ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';

type LLMProvider = 'openai' | 'google' | 'anthropic' | 'ollama';

@Injectable()
export class LLMProviderFactory {
  private readonly logger = new Logger(LLMProviderFactory.name);

  constructor(private configService: ConfigService) {}

  /**
   * Tạo chat model dựa trên provider được chọn
   * @param provider - Provider name (openai, google, anthropic, ollama)
   * @param options - Optional override options (model, temperature, maxTokens, etc.)
   */
  createChatModel(
    provider?: LLMProvider,
    options?: {
      model?: string;          // Override specific model
      temperature?: number;
      maxTokens?: number;
    }
  ): BaseChatModel {
    const selectedProvider = provider || this.configService.get<LLMProvider>('LLM_PROVIDER') || 'ollama';

    this.logger.log(`Creating chat model for provider: ${selectedProvider}`);

    switch (selectedProvider) {
      case 'openai':
        const openaiModel = options?.model || this.configService.get('OPENAI_CHAT_MODEL') || 'gpt-4o';
        return new ChatOpenAI({
          model: openaiModel,
          temperature: options?.temperature ?? 0.3,
          maxTokens: options?.maxTokens ?? 100,
          configuration: {
            baseURL: this.configService.get('OPENAI_BASE_URL') || 'https://api.openai.com/v1',
            apiKey: this.configService.get('OPENAI_API_KEY'),
          },
        });

      case 'google':
        const googleModel = options?.model || this.configService.get('GOOGLE_CHAT_MODEL') || 'gemini-2.5-flash-lite';
        return new ChatGoogleGenerativeAI({
          model: googleModel,
          temperature: options?.temperature ?? 0.3,
          maxOutputTokens: options?.maxTokens ?? 100,
          apiKey: this.configService.get('GOOGLE_API_KEY'),
        });

      case 'anthropic':
        const anthropicModel = options?.model || this.configService.get('ANTHROPIC_CHAT_MODEL') || 'claude-sonnet-4-5-20250929';
        return new ChatAnthropic({
          model: anthropicModel,
          temperature: options?.temperature ?? 0.3,
          maxTokens: options?.maxTokens ?? 100,
          apiKey: this.configService.get('ANTHROPIC_API_KEY'),
        });

      case 'ollama':
      default:
        const ollamaModel = options?.model || this.configService.get('OLLAMA_CHAT_MODEL') || 'llama3';
        return new ChatOllama({
          model: ollamaModel,
          temperature: options?.temperature ?? 0.3,
          numPredict: options?.maxTokens ?? 100,
          baseUrl: this.configService.get('OLLAMA_BASE_URL') || 'http://localhost:11434',
        });
    }
  }

  /**
   * Tạo embedding model
   * Default: Ollama với bge-m3:567m như yêu cầu của user
   */
  createEmbeddingModel(provider?: LLMProvider): Embeddings {
    const selectedProvider = provider || this.configService.get<LLMProvider>('EMBEDDING_PROVIDER') || 'ollama';

    this.logger.log(`Creating embedding model for provider: ${selectedProvider}`);

    switch (selectedProvider) {
      case 'openai':
        return new ChatOpenAI({
          model: this.configService.get('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-small',
          configuration: {
            baseURL: this.configService.get('OPENAI_BASE_URL') || 'https://api.openai.com/v1',
            apiKey: this.configService.get('OPENAI_API_KEY'),
          },
        }) as unknown as Embeddings;

      case 'google':
        return new ChatGoogleGenerativeAI({
          model: this.configService.get('GOOGLE_EMBEDDING_MODEL') || 'text-embedding-004',
          apiKey: this.configService.get('GOOGLE_API_KEY'),
        }) as unknown as Embeddings;

      case 'ollama':
      default:
        // DEFAULT: Ollama với bge-m3:567m
        return new OllamaEmbeddings({
          model: this.configService.get('OLLAMA_EMBEDDING_MODEL') || 'bge-m3:567m',
          baseUrl: this.configService.get('OLLAMA_BASE_URL') || 'http://localhost:11434',
        });
    }
  }
}
```

---

### ĐC-6: LLM Enricher Service (Optional)

**Mục đích:** Generate summaries bằng LLM với support cho multiple providers

**Implementation:**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

@Injectable()
export class LlmEnricherService {
  private readonly logger = new Logger(LlmEnricherService.name);
  private model: BaseChatModel | null = null;

  constructor(
    private configService: ConfigService,
    private llmProviderFactory: LLMProviderFactory
  ) {
    const enabled = this.configService.get('SUMMARY_GENERATION_ENABLED');

    if (enabled) {
      // Sử dụng factory để tạo model
      // Priority: SUMMARY_GENERATION_PROVIDER → LLM_PROVIDER (global)
      const specificProvider = this.configService.get<LLMProvider>('SUMMARY_GENERATION_PROVIDER');
      const provider = specificProvider || this.configService.get<LLMProvider>('LLM_PROVIDER');

      // Priority: SUMMARY_GENERATION_MODEL → Provider's default model
      const specificModel = this.configService.get('SUMMARY_GENERATION_MODEL');

      this.model = this.llmProviderFactory.createChatModel(
        provider,  // Use specific provider or global default
        {
          model: specificModel,  // Override model nếu được set
          temperature: this.configService.get('SUMMARY_TEMPERATURE') || 0.3,
          maxTokens: this.configService.get('SUMMARY_MAX_TOKENS') || 100,
        }
      );

      this.logger.log(
        `Summary generation using provider: ${provider || 'default'}` +
        (specificModel ? `, model: ${specificModel}` : '')
      );
    }
  }

  async generateSummary(chunk: ParentChunk): Promise<SummaryResult | null> {
    if (!this.model) {
      return null;  // LLM enrichment disabled
    }

    try {
      const startTime = Date.now();

      const prompt = `Summarize the following text in 2-3 sentences, focusing on the main idea:

${chunk.content}

Summary:`;

      const response = await this.model.invoke(prompt);
      const summary = response.content.toString().trim();

      const durationMs = Date.now() - startTime;

      // Estimate tokens (rough approximation)
      const tokensUsed = Math.ceil((prompt.length + summary.length) / 4);

      return {
        summary,
        tokensUsed,
        durationMs
      };

    } catch (error) {
      this.logger.error('LLM summary generation failed:', error);
      return null;  // Graceful degradation
    }
  }

  async batchGenerateSummaries(
    chunks: ParentChunk[]
  ): Promise<Map<string, SummaryResult>> {
    const results = new Map<string, SummaryResult>();

    // Process in batches to optimize API calls
    const batchSize = 10;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async chunk => {
          const result = await this.generateSummary(chunk);
          if (result) {
            results.set(chunk.id, result);
          }
        })
      );
    }

    return results;
  }
}
```

---

### ĐC-7: Enrich Stage Orchestrator

**Mục đích:** Điều phối toàn bộ enrichment workflow với multi-provider LLM support

**Implementation:**

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EnrichStageService {
  private readonly logger = new Logger(EnrichStageService.name);

  constructor(
    private metadataEnricher: MetadataEnricherService,
    private entityExtractor: AlgorithmicEntityExtractorService,
    private keywordExtractor: KeywordExtractorService,
    private llmProviderFactory: LLMProviderFactory,  // Factory injection
    private llmEnricher: LlmEnricherService,
    private hypotheticalQuestionsGenerator: HypotheticalQuestionsGeneratorService,
    private configService: ConfigService
  ) {}

  async execute(input: EnrichInputDto): Promise<EnrichOutputDto> {
    this.logger.log(
      `Enriching ${input.parentChunks.length} parents, ` +
      `${input.childChunks.length} children`
    );

    const startTime = Date.now();

    // Enrich parent chunks
    const enrichedParents = await this.enrichParentChunks(
      input.parentChunks,
      input.documentMetadata,
      input.sectionMetadata
    );

    // Enrich child chunks
    const enrichedChildren = await this.enrichChildChunks(
      input.childChunks,
      input.documentMetadata,
      input.sectionMetadata
    );

    const durationMs = Date.now() - startTime;

    this.logger.log(
      `Enrichment completed in ${durationMs}ms`
    );

    return {
      enrichedParents,
      enrichedChildren,
      enrichmentMetadata: {
        totalParents: enrichedParents.length,
        totalChildren: enrichedChildren.length,
        durationMs,
        llmEnrichmentUsed: this.configService.get('LLM_ENRICHMENT_ENABLED'),
      },
      errors: []
    };
  }

  private async enrichParentChunks(
    parents: ParentChunk[],
    documentMetadata: DocumentMetadata,
    sectionMetadata: Map<string, SectionMetadata>
  ): Promise<EnrichedParentChunk[]> {

    const enriched: EnrichedParentChunk[] = [];

    for (const parent of parents) {
      try {
        const section = sectionMetadata.get(parent.metadata.sectionId);

        // 1. Add hierarchical metadata
        const metadata = this.metadataEnricher.enrichMetadata(
          parent,
          documentMetadata,
          section
        );

        // 2. Extract entities (algorithmic)
        if (this.configService.get('ENTITY_EXTRACTION_ENABLED')) {
          metadata.entities = this.entityExtractor.extractEntities(parent.content);
        }

        // 3. Extract keywords (TF-IDF or LLM)
        const keywordMethod = this.configService.get('KEYWORD_EXTRACTION_METHOD');
        if (keywordMethod === 'tfidf') {
          // Will be done in batch after all chunks processed
        } else if (keywordMethod === 'llm') {
          // Will be done in batch with summaries
        }

        // 4. Generate summary (LLM, optional)
        if (this.configService.get('SUMMARY_GENERATION_ENABLED')) {
          const summaryResult = await this.llmEnricher.generateSummary(parent);
          if (summaryResult) {
            metadata.summary = summaryResult.summary;
          }
        }

        // 5. Generate hypothetical questions (LLM, optional)
        if (this.configService.get('HYPOTHETICAL_QUESTIONS_ENABLED')) {
          const questionsResult = await this.hypotheticalQuestionsGenerator.generateQuestions(parent);
          if (questionsResult) {
            metadata.hypotheticalQuestions = questionsResult.questions;
          }
        }

        enriched.push({
          ...parent,
          metadata
        });

      } catch (error) {
        this.logger.error(`Failed to enrich parent ${parent.id}:`, error);

        // Graceful degradation: Use chunk with basic metadata
        enriched.push({
          ...parent,
          metadata: this.metadataEnricher.enrichMetadata(
            parent,
            documentMetadata,
            sectionMetadata.get(parent.metadata.sectionId)
          )
        });
      }
    }

    // Batch keyword extraction (TF-IDF)
    if (this.configService.get('KEYWORD_EXTRACTION_METHOD') === 'tfidf') {
      for (let i = 0; i < enriched.length; i++) {
        enriched[i].metadata.keywords = this.keywordExtractor.extractKeywords(
          enriched,
          i
        );
      }
    }

    return enriched;
  }

  private async enrichChildChunks(
    children: ChildChunk[],
    documentMetadata: DocumentMetadata,
    sectionMetadata: Map<string, SectionMetadata>
  ): Promise<EnrichedChildChunk[]> {

    const enriched: EnrichedChildChunk[] = [];

    for (const child of children) {
      try {
        const section = sectionMetadata.get(child.metadata.sectionId);

        // 1. Add hierarchical metadata
        const metadata = this.metadataEnricher.enrichMetadata(
          child,
          documentMetadata,
          section
        );

        // 2. Extract entities (algorithmic)
        // NOTE: Children cũng có entities để hỗ trợ filtering
        if (this.configService.get('ENTITY_EXTRACTION_ENABLED')) {
          metadata.entities = this.entityExtractor.extractEntities(child.content);
        }

        // 3. NO summary for children (too small)
        // 4. NO keywords for children (will use parent's keywords)

        enriched.push({
          ...child,
          metadata
        });

      } catch (error) {
        this.logger.error(`Failed to enrich child ${child.id}:`, error);

        // Graceful degradation
        enriched.push({
          ...child,
          metadata: this.metadataEnricher.enrichMetadata(
            child,
            documentMetadata,
            sectionMetadata.get(child.metadata.sectionId)
          )
        });
      }
    }

    return enriched;
  }
}
```

---

## Điểm tích hợp

### 1. Chunk Stage (Input)

**Protocol:** LangGraph state transition

**Input State:**
```typescript
{
  parentChunks: ParentChunk[];
  childChunks: ChildChunk[];
  lineage: ChunkLineage[];
  structuredDoc: StructuredDocument;  // For section metadata
  currentStage: 'chunk';
}
```

**What Enrich Stage needs:**
- `parentChunks` và `childChunks` - Để enrich
- `structuredDoc.sections` - Để lấy section metadata
- `lineage` - Để validate parent-child relationships

---

### 2. Embed Stage (Output)

**Protocol:** LangGraph state transition

**Output State:**
```typescript
{
  ...inputState,
  enrichedParents: EnrichedParentChunk[];
  enrichedChildren: EnrichedChildChunk[];
  enrichmentMetadata: {
    totalParents: number;
    totalChildren: number;
    durationMs: number;
    llmEnrichmentUsed: boolean;
  };
  currentStage: 'enrich';
  errors: string[];
}
```

---

## Luồng dữ liệu

### Happy Path

```
1. Enrich Stage bắt đầu với state từ Chunk Stage
   ↓
2. EnrichStageService.execute(state)
   ↓
3. Validate input (parentChunks, childChunks không empty)
   ↓
4. Enrich Parent Chunks:
   ├─ 4.1. Add hierarchical metadata
   ├─ 4.2. Extract entities (algorithmic)
   ├─ 4.3. Extract keywords (TF-IDF batch processing)
   ├─ 4.4. [Optional] Generate summaries (LLM)
   │       └─ Sử dụng SUMMARY_GENERATION_MODEL hoặc default provider model
   └─ 4.5. [Optional] Generate hypothetical questions (LLM, Multi-Vector)
           └─ Sử dụng HYPOTHETICAL_QUESTIONS_MODEL hoặc default provider model
   ↓
5. Enrich Child Chunks:
   ├─ 5.1. Add hierarchical metadata
   └─ 5.2. Extract entities (algorithmic)
   ↓
6. Validate enriched chunks
   ↓
7. Return EnrichOutputDto
   ↓
8. Update workflow state
   ↓
9. Transition sang Embed Stage
```

### Error Path - Entity Extraction Fails

```
1-3. (Same as happy path)
   ↓
4. enrichParentChunks()
   ↓
5. entityExtractor.extractEntities() → Throws error
   ↓
6. Catch error, log warning
   ↓
7. Set metadata.entities = []
   ↓
8. Continue với metadata cơ bản
   ↓
9. Chunk vẫn proceed (graceful degradation)
```

### Edge Case - All Enrichments Fail

```
1-3. (Same as happy path)
   ↓
4. Tất cả enrichment methods đều fail
   ↓
5. Fallback: Chỉ add hierarchical metadata (bắt buộc)
   ↓
6. Log warnings về enrichment failures
   ↓
7. Chunks vẫn proceed với minimal metadata
   ↓
8. Không fail toàn bộ job
```

---

## Chiến lược xử lý lỗi

### Phân loại Lỗi

**1. Non-critical Errors (Warnings):**

```typescript
// Entity extraction fails
try {
  metadata.entities = entityExtractor.extractEntities(content);
} catch (error) {
  logger.warn('Entity extraction failed:', error);
  metadata.entities = [];  // ✅ Continue với empty array
}

// Keyword extraction fails
try {
  metadata.keywords = keywordExtractor.extractKeywords(...);
} catch (error) {
  logger.warn('Keyword extraction failed:', error);
  metadata.keywords = [];  // ✅ Continue
}

// LLM summary generation fails
try {
  const summary = await llmEnricher.generateSummary(chunk);
  metadata.summary = summary?.summary;
} catch (error) {
  logger.warn('Summary generation failed:', error);
  metadata.summary = undefined;  // ✅ Continue
}
```

**2. Critical Errors (Fail enrichment):**

```typescript
// Metadata enrichment fails (required)
try {
  metadata = metadataEnricher.enrichMetadata(...);
} catch (error) {
  logger.error('Critical: Metadata enrichment failed:', error);
  throw error;  // ❌ Phải fail
}

// Content modified accidentally
if (original.content !== enriched.content) {
  throw new Error('Content was modified during enrichment');
  // ❌ Phải fail - data integrity issue
}
```

**3. Graceful Degradation Strategy:**

```typescript
async enrichChunk(chunk: Chunk): Promise<EnrichedChunk> {
  const enriched = { ...chunk };

  // Required: Hierarchical metadata (MUST succeed)
  enriched.metadata = this.metadataEnricher.enrichMetadata(...);

  // Optional: Entities (best effort)
  try {
    enriched.metadata.entities = this.entityExtractor.extractEntities(...);
  } catch (error) {
    this.logger.warn('Entity extraction failed, using empty array');
    enriched.metadata.entities = [];
  }

  // Optional: Keywords (best effort)
  try {
    enriched.metadata.keywords = this.keywordExtractor.extractKeywords(...);
  } catch (error) {
    this.logger.warn('Keyword extraction failed, using empty array');
    enriched.metadata.keywords = [];
  }

  // Optional: Summary (best effort)
  if (this.config.summaryEnabled) {
    try {
      const summary = await this.llmEnricher.generateSummary(chunk);
      enriched.metadata.summary = summary?.summary;
    } catch (error) {
      this.logger.warn('Summary generation failed, skipping');
    }
  }

  return enriched;
}
```

---

## Yêu cầu hiệu năng

### Mục tiêu Performance

| Thao tác | Mục tiêu | Chấp nhận được | Ghi chú |
|----------|----------|----------------|---------|
| Hierarchical metadata (1 chunk) | <1ms | <5ms | Very fast |
| Entity extraction (1 chunk, algorithmic) | <10ms | <50ms | Regex + NLP |
| Keyword extraction (batch TF-IDF) | <100ms | <500ms | Per document |
| LLM summary (1 chunk) | <500ms | <2s | API latency |
| Full document (50 chunks, no LLM) | <5s | <15s | End-to-end |
| Full document (50 chunks, with LLM) | <30s | <60s | With summaries |

### Chiến lược Tối ưu

**1. Batch Processing:**
```typescript
// ✅ Extract keywords for all chunks in one pass (TF-IDF)
const allKeywords = this.keywordExtractor.batchExtractKeywords(chunks);

// ✅ Generate summaries in batches (LLM)
const summaries = await this.llmEnricher.batchGenerateSummaries(parentChunks);
```

**2. Parallel Processing:**
```typescript
// ✅ Process parent và child chunks song song
const [enrichedParents, enrichedChildren] = await Promise.all([
  this.enrichParentChunks(parents, ...),
  this.enrichChildChunks(children, ...)
]);
```

**3. Conditional Execution:**
```typescript
// ✅ Chỉ chạy expensive operations khi enabled
if (this.config.llmEnrichmentEnabled) {
  metadata.summary = await this.generateSummary(chunk);
}

if (this.config.entityExtractionEnabled) {
  metadata.entities = this.extractEntities(chunk.content);
}
```

---

## Chiến lược kiểm thử

### Unit Tests

**Coverage Target:** 90%

**Test Cases:**

1. **MetadataEnricherService:**
   - Thêm hierarchical metadata correctly
   - Bảo toàn document/section context
   - Handle missing optional fields

2. **AlgorithmicEntityExtractorService:**
   - Extract emails, URLs, phones correctly
   - Extract dates, money, percents với regex
   - Extract NLP entities (people, places, orgs)
   - Deduplicate entities
   - Handle extraction errors gracefully

3. **KeywordExtractorService:**
   - Extract top-K keywords với TF-IDF
   - Normalize keywords (lowercase)
   - Handle empty content

4. **LlmEnricherService:**
   - Generate summaries với OpenAI
   - Handle API errors gracefully
   - Batch processing correctly
   - Track token usage

5. **EnrichStageService:**
   - Orchestrate toàn bộ workflow
   - Graceful degradation khi enrichments fail
   - Validate enriched chunks
   - Không modify chunk content

---

### Integration Tests

**Test Cases:**

1. **Full Enrichment Flow:**
   - Parent và child chunks được enrich correctly
   - Metadata nhất quán giữa parents và children
   - Entities extracted cho cả hai

2. **LLM Integration:**
   - OpenAI API calls thành công
   - Batch summaries generated
   - Errors handled gracefully

3. **Error Scenarios:**
   - Entity extraction fails → Continue
   - LLM unavailable → Skip summaries
   - Invalid chunk content → Fail with clear error

---

## Tiêu chí thành công

### Success Metrics

**1. Data Integrity:**
- ✅ 100% chunks có hierarchical metadata
- ✅ 0 chunks có modified content
- ✅ 0 chunks có modified token count

**2. Enrichment Quality:**
- ✅ >80% chunks có ít nhất 1 entity extracted (nếu enabled)
- ✅ >90% parent chunks có keywords extracted (nếu enabled)
- ✅ All parent chunks có summary (nếu LLM enabled)

**3. Hiệu năng:**
- ✅ <15s cho 50 chunks (algorithmic only)
- ✅ <60s cho 50 chunks (with LLM summaries)
- ✅ No memory leaks

**4. Độ tin cậy:**
- ✅ Graceful degradation khi enrichments fail
- ✅ Không fail jobs do enrichment errors
- ✅ Logging toàn diện

---

## Các giai đoạn triển khai

### Phase 1: Core Metadata (Tuần 1)

**Deliverables:**
- [ ] EnrichModule structure
- [ ] MetadataEnricherService (hierarchical metadata)
- [ ] Basic validation logic
- [ ] Unit tests cho metadata enrichment

**Dependencies:**
- Chunk Stage completed

---

### Phase 2: Algorithmic Enrichment (Tuần 2)

**Deliverables:**
- [ ] AlgorithmicEntityExtractorService (regex + NLP)
- [ ] KeywordExtractorService (TF-IDF)
- [ ] Entity deduplication
- [ ] Integration tests

**Dependencies:**
- Phase 1 completed
- Install `compromise` và `natural` libraries

---

### Phase 3: LLM Enrichment (Optional, Tuần 3)

**Deliverables:**
- [ ] LLMProviderFactory implementation (multi-provider support)
- [ ] LlmEnricherService with factory integration
- [ ] HypotheticalQuestionsGeneratorService with factory integration
- [ ] Multi-provider configuration (OpenAI, Google, Anthropic, Ollama)
- [ ] Batch processing logic
- [ ] Cost tracking
- [ ] Configuration toggles

**Dependencies:**
- Phase 2 completed
- LLM provider API keys (OpenAI, Google, Anthropic) hoặc Ollama local setup

---

### Phase 4: Integration & Polish (Tuần 4)

**Deliverables:**
- [ ] LangGraph workflow integration
- [ ] Error handling toàn diện
- [ ] Performance optimization
- [ ] Documentation
- [ ] End-to-end testing

**Dependencies:**
- All phases completed
- LangGraph workflow ready

---

## Phụ thuộc & Rủi ro

### External Dependencies

| Dependency | Purpose | Risk | Mitigation |
|------------|---------|------|------------|
| compromise | NLP entity extraction | Library bugs | Wrap in try-catch, have regex fallback |
| natural | TF-IDF keyword extraction | Performance issues | Cache results, batch processing |
| OpenAI API | LLM summaries (optional) | API downtime | Graceful degradation, disable by default |

### Technical Risks

| Rủi ro | Xác suất | Tác động | Giảm thiểu |
|--------|----------|---------|------------|
| Entity extraction inaccuracy | Cao | Thấp | Best-effort approach, not critical |
| LLM API costs high | Cao | Trung bình | Disable by default, user opt-in |
| Performance degradation | Trung bình | Trung bình | Batch processing, parallel execution |
| Metadata consistency bugs | Thấp | Cao | Comprehensive validation, tests |

---

## Phụ lục

### Phụ lục A: Entity Types Reference

| Entity Type | Examples | Detection Method |
|-------------|----------|------------------|
| PERSON | "John Smith", "Dr. Jane Doe" | NLP (compromise) |
| ORGANIZATION | "Microsoft Corp", "UN" | NLP (compromise) |
| LOCATION | "New York", "Paris" | NLP (compromise) |
| DATE | "2024-11-04", "Nov 4, 2024" | Regex patterns |
| MONEY | "$1,000", "100 USD" | Regex patterns |
| PERCENT | "25%", "0.5%" | Regex patterns |
| EMAIL | "user@example.com" | Regex patterns |
| URL | "https://example.com" | Regex patterns |
| PHONE | "+1-234-567-8900" | Regex patterns |

---

### Phụ lục B: Configuration Reference

#### Environment Variables

```bash
# ============================================
# LLM Provider Configuration
# ============================================

# Provider Selection
LLM_PROVIDER=ollama                    # Options: openai | google | anthropic | ollama
EMBEDDING_PROVIDER=ollama              # Options: openai | google | ollama (Default: ollama)

# --------------------------------------------
# OpenAI Configuration
# --------------------------------------------
OPENAI_API_KEY=sk-...                  # Required if using OpenAI
OPENAI_BASE_URL=https://api.openai.com/v1  # Custom base URL (optional)
OPENAI_CHAT_MODEL=gpt-4o               # Chat model (default: gpt-4o)
OPENAI_EMBEDDING_MODEL=text-embedding-3-small  # Embedding model

# --------------------------------------------
# Google Gemini Configuration
# --------------------------------------------
GOOGLE_API_KEY=...                     # Required if using Google
GOOGLE_CHAT_MODEL=gemini-2.5-flash-lite  # Chat model (default: gemini-2.5-flash-lite)
GOOGLE_EMBEDDING_MODEL=text-embedding-004  # Embedding model

# --------------------------------------------
# Anthropic Claude Configuration
# --------------------------------------------
ANTHROPIC_API_KEY=sk-ant-...           # Required if using Anthropic
ANTHROPIC_BASE_URL=https://api.anthropic.com  # Custom base URL (optional)
ANTHROPIC_CHAT_MODEL=claude-sonnet-4-5-20250929  # Chat model

# --------------------------------------------
# Ollama Configuration (DEFAULT for embeddings)
# --------------------------------------------
OLLAMA_BASE_URL=http://localhost:11434  # Ollama server URL
OLLAMA_CHAT_MODEL=llama3               # Chat model for summaries/questions
OLLAMA_EMBEDDING_MODEL=bge-m3:567m     # DEFAULT embedding model (as specified)

# ============================================
# Enrichment Feature Toggles
# ============================================

# Entity Extraction (Algorithmic)
ENTITY_EXTRACTION_ENABLED=true         # Default: true
ENTITY_EXTRACTION_METHODS=regex,nlp    # Methods: regex, nlp
ENTITY_MIN_CONFIDENCE=0.5              # Minimum confidence threshold

# Keyword Extraction
KEYWORD_EXTRACTION_METHOD=tfidf        # Options: tfidf | llm | none (Default: tfidf)
KEYWORD_TOP_K=10                       # Top K keywords to extract

# LLM-based Summary Generation (Optional)
SUMMARY_GENERATION_ENABLED=false       # Default: false (có chi phí)
SUMMARY_GENERATION_PROVIDER=           # Provider for summaries (optional)
                                       # Options: openai | google | anthropic | ollama
                                       # If not set, uses LLM_PROVIDER (global default)
                                       # Example: "openai" or "google"
SUMMARY_GENERATION_MODEL=              # Model for summaries (optional)
                                       # If not set, uses provider's default model:
                                       # - OpenAI: OPENAI_CHAT_MODEL
                                       # - Google: GOOGLE_CHAT_MODEL
                                       # - Anthropic: ANTHROPIC_CHAT_MODEL
                                       # - Ollama: OLLAMA_CHAT_MODEL
                                       # Example: "gpt-4o-mini" or "gemini-1.5-flash"
SUMMARY_MAX_TOKENS=100                 # Max tokens for summary
SUMMARY_TEMPERATURE=0.3                # Temperature (0.0-1.0)
SUMMARY_BATCH_SIZE=10                  # Chunks per batch
SUMMARY_TIMEOUT_MS=30000               # Timeout per batch

# Hypothetical Questions Generation (Optional, Multi-Vector)
HYPOTHETICAL_QUESTIONS_ENABLED=false   # Default: false (có chi phí)
HYPOTHETICAL_QUESTIONS_PROVIDER=       # Provider for questions (optional)
                                       # Options: openai | google | anthropic | ollama
                                       # If not set, uses LLM_PROVIDER (global default)
                                       # Example: "anthropic" or "openai"
HYPOTHETICAL_QUESTIONS_MODEL=          # Model for questions (optional)
                                       # If not set, uses provider's default model:
                                       # - OpenAI: OPENAI_CHAT_MODEL
                                       # - Google: GOOGLE_CHAT_MODEL
                                       # - Anthropic: ANTHROPIC_CHAT_MODEL
                                       # - Ollama: OLLAMA_CHAT_MODEL
                                       # Example: "gpt-4o" or "claude-sonnet-4-5"
HYPOTHETICAL_QUESTIONS_COUNT=5         # Questions per chunk (3-5)
HYPOTHETICAL_QUESTIONS_MAX_TOKENS=150  # Max tokens for questions
HYPOTHETICAL_QUESTIONS_TEMPERATURE=0.7 # Higher for diversity
HYPOTHETICAL_QUESTIONS_BATCH_SIZE=10   # Chunks per batch
HYPOTHETICAL_QUESTIONS_TIMEOUT_MS=30000  # Timeout per batch

# ============================================
# Performance Configuration
# ============================================
ENRICH_PARALLEL_CHUNKS=10              # Parallel chunk processing
ENRICH_TIMEOUT_MS=60000                # Overall stage timeout
```

#### TypeScript Configuration Interface

```typescript
interface EnrichStageConfig {
  // LLM Provider Selection
  llmProvider: {
    chat: 'openai' | 'google' | 'anthropic' | 'ollama';      // Default: 'ollama'
    embedding: 'openai' | 'google' | 'ollama';               // Default: 'ollama'
  };

  // Provider Credentials
  providers: {
    openai: {
      apiKey: string;
      baseURL?: string;                // Custom base URL
      chatModel?: string;              // Default: 'gpt-4o'
      embeddingModel?: string;         // Default: 'text-embedding-3-small'
    };
    google: {
      apiKey: string;
      chatModel?: string;              // Default: 'gemini-2.5-flash-lite'
      embeddingModel?: string;         // Default: 'text-embedding-004'
    };
    anthropic: {
      apiKey: string;
      baseURL?: string;                // Custom base URL
      chatModel?: string;              // Default: 'claude-sonnet-4-5-20250929'
    };
    ollama: {
      baseURL: string;                 // Default: 'http://localhost:11434'
      chatModel?: string;              // Default: 'llama3'
      embeddingModel: string;          // Default: 'bge-m3:567m' (USER SPECIFIED)
    };
  };

  // Entity extraction
  entityExtraction: {
    enabled: boolean;                  // Default: true
    methods: string[];                 // Default: ['regex', 'nlp']
    minConfidence: number;             // Default: 0.5
  };

  // Keyword extraction
  keywordExtraction: {
    method: 'tfidf' | 'llm' | 'none';  // Default: 'tfidf'
    topK: number;                      // Default: 10
  };

  // Summary generation (LLM-based, optional)
  summaryGeneration: {
    enabled: boolean;                  // Default: false
    provider?: LLMProvider;            // Specific provider (optional)
                                       // If not set, uses llmProvider.chat
    model?: string;                    // Specific model (optional)
                                       // If not set, uses provider's default
    maxTokens: number;                 // Default: 100
    temperature: number;               // Default: 0.3
    batchSize: number;                 // Default: 10
    timeout: number;                   // Default: 30000ms
  };

  // Hypothetical questions generation (Multi-Vector, optional)
  hypotheticalQuestions: {
    enabled: boolean;                  // Default: false
    provider?: LLMProvider;            // Specific provider (optional)
                                       // If not set, uses llmProvider.chat
    model?: string;                    // Specific model (optional)
                                       // If not set, uses provider's default
    questionsPerChunk: number;         // Default: 3-5
    maxTokens: number;                 // Default: 150
    temperature: number;               // Default: 0.7 (more creative)
    batchSize: number;                 // Default: 10
    timeout: number;                   // Default: 30000ms
  };

  // Performance
  performance: {
    parallelChunks: number;            // Default: 10
    timeout: number;                   // Default: 60000ms
  };
}
```

#### Provider Switching Examples

**Example 1: Sử dụng OpenAI cho tất cả LLM operations**
```bash
LLM_PROVIDER=openai
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

**Example 2: Sử dụng Google Gemini cho chat, Ollama cho embeddings (recommended)**
```bash
LLM_PROVIDER=google
EMBEDDING_PROVIDER=ollama
GOOGLE_API_KEY=...
GOOGLE_CHAT_MODEL=gemini-2.5-flash-lite
OLLAMA_EMBEDDING_MODEL=bge-m3:567m  # Default as specified
```

**Example 3: Sử dụng Ollama cho tất cả (local, free)**
```bash
LLM_PROVIDER=ollama
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3
OLLAMA_EMBEDDING_MODEL=bge-m3:567m  # Default
```

**Example 4: Sử dụng Anthropic Claude cho chat, Ollama cho embeddings**
```bash
LLM_PROVIDER=anthropic
EMBEDDING_PROVIDER=ollama
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_CHAT_MODEL=claude-sonnet-4-5-20250929
OLLAMA_EMBEDDING_MODEL=bge-m3:567m
```

**Example 5: Sử dụng models khác nhau cho từng step (cùng provider)**
```bash
# Default provider: OpenAI
LLM_PROVIDER=openai
EMBEDDING_PROVIDER=ollama
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o  # Default model

# Summaries: Sử dụng cheaper model từ cùng provider
SUMMARY_GENERATION_ENABLED=true
# SUMMARY_GENERATION_PROVIDER không set → dùng LLM_PROVIDER (openai)
SUMMARY_GENERATION_MODEL=gpt-4o-mini  # Override: cheaper model

# Hypothetical Questions: Sử dụng better model từ cùng provider
HYPOTHETICAL_QUESTIONS_ENABLED=true
# HYPOTHETICAL_QUESTIONS_PROVIDER không set → dùng LLM_PROVIDER (openai)
HYPOTHETICAL_QUESTIONS_MODEL=gpt-4o  # Override: better model

# Embeddings: Local Ollama
OLLAMA_EMBEDDING_MODEL=bge-m3:567m
```

**Example 6: Mix providers cho từng step (advanced)**
```bash
# Default provider: Ollama (local/free)
LLM_PROVIDER=ollama
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3
OLLAMA_EMBEDDING_MODEL=bge-m3:567m

# Setup API keys cho cloud providers
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Summaries: Sử dụng Google Gemini (fast & cheap)
SUMMARY_GENERATION_ENABLED=true
SUMMARY_GENERATION_PROVIDER=google  # Override: use Google
SUMMARY_GENERATION_MODEL=gemini-2.5-flash-lite  # Cheap model

# Hypothetical Questions: Sử dụng OpenAI (high quality)
HYPOTHETICAL_QUESTIONS_ENABLED=true
HYPOTHETICAL_QUESTIONS_PROVIDER=openai  # Override: use OpenAI
HYPOTHETICAL_QUESTIONS_MODEL=gpt-4o  # Better quality
```

**Example 7: Cost optimization strategy**
```bash
# Default provider: Ollama (local, free)
LLM_PROVIDER=ollama
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3  # Default: local model
OLLAMA_EMBEDDING_MODEL=bge-m3:567m

# Summaries: Local Ollama (free)
SUMMARY_GENERATION_ENABLED=true
# Không set SUMMARY_GENERATION_PROVIDER → Dùng LLM_PROVIDER (ollama)
# Không set SUMMARY_GENERATION_MODEL → Dùng OLLAMA_CHAT_MODEL (llama3)

# Hypothetical Questions: Cloud API với better model (có chi phí)
# NOTE: Cần thêm API key cho OpenAI
OPENAI_API_KEY=sk-...
HYPOTHETICAL_QUESTIONS_ENABLED=true
HYPOTHETICAL_QUESTIONS_PROVIDER=openai  # Override: use cloud API
HYPOTHETICAL_QUESTIONS_MODEL=gpt-4o  # Better quality cho critical task
```

---

### Phụ lục C: Enriched Metadata Schema

```typescript
interface EnrichedMetadata {
  // Hierarchical metadata (required)
  documentId: string;
  fileId: string;
  filename: string;
  documentType: string;
  sectionPath: string;
  sectionLevel: number;
  pageNumber?: number;
  lineNumberStart?: number;
  lineNumberEnd?: number;
  parentChunkId?: string;
  childChunkIds?: string[];
  chunkIndex: number;
  enrichedAt: Date;

  // Entities (optional, array)
  entities?: Entity[];

  // Keywords (optional, array)
  keywords?: string[];

  // Summary (optional, string)
  summary?: string;

  // Hypothetical questions (optional, array)
  hypotheticalQuestions?: string[];
}

interface Entity {
  type: EntityType;
  text: string;
  confidence: number;      // 0.0 - 1.0
  offsets?: [number, number][];
}
```

---

## Kết luận

Enrich Stage được thiết kế với nguyên tắc:
1. **100% Data Integrity** - Không modify content
2. **Graceful Degradation** - Enrichments fail → Continue
3. **Configurable** - Algorithmic (fast/free) + Optional LLM (quality/cost)
4. **Production Ready** - Error handling toàn diện
5. **Multi-Vector Ready** - Hỗ trợ hypothetical questions cho advanced retrieval

### Điểm nổi bật:

✅ **Algorithmic-first approach** (tiết kiệm chi phí, nhanh)
✅ **Optional LLM enrichment** (chất lượng cao khi cần)
✅ **Multi-provider LLM support** (OpenAI, Google, Anthropic, Ollama)
✅ **Per-step model selection** (chọn model riêng cho Summary và Hypothetical Questions)
✅ **Flexible configuration** (dễ dàng switch providers cho từng use case)
✅ **Default Ollama embeddings** (bge-m3:567m - local, free, high quality)
✅ **Zero content modification** (data integrity)
✅ **Graceful error handling** (không fail jobs)
✅ **Batch processing** (performance optimization)
✅ **Multi-Vector Retrieval support** (hypothetical questions cho Q&A use cases)

---

**Trạng thái tài liệu:** Nháp
**Xem xét tiếp theo:** 2025-11-10
**Lịch sử phiên bản:**
- v1.0 (2025-11-04): Tạo Enrich Stage implementation plan ban đầu
- v1.1 (2025-11-04): Thêm Hypothetical Questions Generation (Multi-Vector Retrieval support)
- v1.2 (2025-11-04): Thêm Multi-Provider LLM Support (OpenAI, Google, Anthropic, Ollama) với LLMProviderFactory pattern
- v1.3 (2025-11-04): Thêm per-step model selection (SUMMARY_GENERATION_MODEL, HYPOTHETICAL_QUESTIONS_MODEL) và update Happy Path với Hypothetical Questions
- v1.4 (2025-11-04): Thêm per-step provider selection (SUMMARY_GENERATION_PROVIDER, HYPOTHETICAL_QUESTIONS_PROVIDER) cho flexibility tối đa trong việc chọn provider và model cho từng enrichment step

---

**Kết thúc tài liệu**
