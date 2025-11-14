# Kế Hoạch Triển Khai Embed Stage

**Phiên bản:** 2.0
**Cập nhật lần cuối:** 2025-11-04
**Trạng thái:** Nháp
**Giai đoạn:** 6/7 (Embed)

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

Embed Stage là **giai đoạn thứ 6 trong pipeline indexing** (7 giai đoạn), chịu trách nhiệm chuyển đổi chunks (văn bản) thành vector embeddings để hỗ trợ semantic search và hybrid retrieval.

**Vị trí trong pipeline:**

```
Load → Parse → Structure → Chunk → Enrich → [EMBED] → Persist
                                              ^^^^
                                         Giai đoạn này
```

**Chức năng chính:**

- **Multi-Vector Retrieval**: Generate embeddings cho child chunks, summaries, và hypothetical questions
- **Dense Embeddings**: Semantic search với 1024-dim vectors (BGE-M3)
- **Sparse Embeddings**: Hybrid search với BM25/SPLADE (REQUIRED)
- Batch processing để tối ưu throughput
- Multi-provider support (Ollama, OpenAI, Google, Anthropic)
- Default: **Ollama với bge-m3:567m** (local, free, 1024-dim)
- Graceful error handling và retry logic
- Performance optimization (batch size, concurrent requests)

### Nguyên tắc thiết kế

**Multi-Vector Retrieval Strategy - Embed nhiều loại vectors để tối ưu retrieval accuracy:**

```
Input từ Enrich Stage:
{
  enrichedParents: [
    {
      id: "parent-123",
      content: "This is about machine learning...",  // 1200 tokens
      tokens: 1200,
      summary: "ML enables systems to learn from data",  // Optional
      hypotheticalQuestions: [                          // Optional
        "What is machine learning?",
        "How do ML systems learn?"
      ],
      metadata: { ... }
    }
  ],
  enrichedChildren: [
    {
      id: "child-456",
      content: "Machine learning is...",  // 400 tokens
      tokens: 400,
      parentChunkId: "parent-123",
      metadata: { ... }
    }
  ]
}

Output (Multi-Vector Embeddings):
{
  // 1. Child chunks with dense + sparse embeddings
  embeddedChildren: [
    {
      id: "child-456",
      content: "Machine learning is...",
      denseEmbedding: [0.123, -0.456, ...],     // 1024-dim vector (BGE-M3)
      sparseEmbedding: {                         // BM25/SPLADE
        indices: [123, 456, 789],
        values: [0.8, 0.6, 0.4]
      },
      metadata: { ... }
    }
  ],

  // 2. Summaries with dense + sparse embeddings (if enabled)
  embeddedSummaries: [
    {
      id: "summary-parent-123",
      parentChunkId: "parent-123",
      content: "ML enables systems to learn from data",
      denseEmbedding: [0.234, -0.567, ...],
      sparseEmbedding: { indices: [...], values: [...] }
    }
  ],

  // 3. Hypothetical questions with dense + sparse embeddings (if enabled)
  embeddedQuestions: [
    {
      id: "question-1-parent-123",
      parentChunkId: "parent-123",
      question: "What is machine learning?",
      denseEmbedding: [0.345, -0.678, ...],
      sparseEmbedding: { indices: [...], values: [...] }
    },
    {
      id: "question-2-parent-123",
      parentChunkId: "parent-123",
      question: "How do ML systems learn?",
      denseEmbedding: [0.456, -0.789, ...],
      sparseEmbedding: { indices: [...], values: [...] }
    }
  ],

  // 4. Parent chunks metadata (NO embeddings - stored in MySQL only)
  parentChunksMetadata: [
    {
      id: "parent-123",
      content: "This is about machine learning...",
      tokens: 1200,
      metadata: { ... }
    }
  ]
}
```

**Lý do Multi-Vector Retrieval:**

1. **Better Accuracy**: Multiple vector types → higher retrieval accuracy (10-20% improvement)
2. **Query Type Coverage**:
   - Child chunks: Precise semantic search
   - Summaries: High-level concept matching
   - Questions: Q&A style queries
3. **Hybrid Search**: Dense (semantic) + Sparse (keyword) → best of both worlds
4. **Small-to-Big Pattern**: Retrieve via multiple entry points → return full parent chunk
5. **Configurable**: Enable/disable summaries and questions based on use case

### Phạm vi

**Trong phạm vi:**

- ✅ **Multi-Vector Embeddings**:
  - Child chunks (400 tokens) - REQUIRED
  - Summaries (if `SUMMARY_GENERATION_ENABLED=true`)
  - Hypothetical questions (if `HYPOTHETICAL_QUESTIONS_ENABLED=true`)
- ✅ **Dense Embeddings**: 1024-dim vectors (BGE-M3) - REQUIRED
- ✅ **Sparse Embeddings**: BM25/SPLADE - REQUIRED
- ✅ Multi-provider support: Ollama (default), OpenAI, Google
- ✅ Batch processing: 32 chunks per batch (configurable)
- ✅ Retry logic với exponential backoff
- ✅ Progress tracking và logging
- ✅ Performance monitoring (throughput, latency)
- ✅ Pass-through parent chunks metadata (no embedding generation)

**Ngoài phạm vi:**

- ❌ Generate embeddings cho parent chunks content (will be stored in MySQL only)
- ❌ Store vectors in Qdrant (→ Persist Stage)
- ❌ Store chunk metadata in MySQL (→ Persist Stage)
- ❌ Retrieval logic (search, ranking, re-ranking) (→ Retrieval Service)
- ❌ Fine-tuning embedding models
- ❌ Custom embedding model training

### Giá trị nghiệp vụ

1. **Multi-Vector Retrieval**: 10-20% improvement in retrieval accuracy
   - Child chunks: Precise semantic matching
   - Summaries: High-level concept queries
   - Questions: Q&A style searches
2. **Hybrid Search**: Dense (semantic) + Sparse (keyword) → best of both worlds
3. **Query Flexibility**: Handle diverse query types (questions, statements, keywords)
4. **Cost Efficiency**: Ollama local → zero API costs (vs OpenAI ~$0.0001/1K tokens)
5. **Data Privacy**: 100% local processing, không gửi data ra ngoài
6. **Flexibility**: Multi-provider support → dễ dàng switch giữa các models
7. **Scalability**: Batch processing → throughput cao, latency thấp

---

## Yêu cầu nghiệp vụ

### YN-1: Multi-Vector Embeddings Generation

**Độ ưu tiên:** P0 (Cực kỳ quan trọng)

**Mô tả:**
Hệ thống phải generate **multi-vector embeddings** (dense + sparse) cho child chunks, summaries, và hypothetical questions để hỗ trợ hybrid retrieval và multi-vector search.

**Tiêu chí chấp nhận:**

- ✅ **Child Chunks** (REQUIRED):
  - 100% child chunks có dense + sparse embeddings
  - Dense: 1024-dim vector (BGE-M3)
  - Sparse: BM25/SPLADE indices và values
- ✅ **Summaries** (if `SUMMARY_GENERATION_ENABLED=true`):
  - Generate embeddings cho summaries từ parent chunks
  - Dense + Sparse embeddings
  - Link back to parent chunk ID
- ✅ **Hypothetical Questions** (if `HYPOTHETICAL_QUESTIONS_ENABLED=true`):
  - Generate embeddings cho mỗi hypothetical question
  - Dense + Sparse embeddings
  - Link back to parent chunk ID
- ✅ Embeddings có đúng dimensions (1024-dim cho BGE-M3)
- ✅ Embeddings normalized (L2 norm = 1) nếu model yêu cầu
- ✅ Preserve toàn bộ content và metadata
- ✅ Embeddings deterministic (cùng input → cùng output)
- ✅ Graceful handling khi embedding generation fails

**Implementation:**

```typescript
// 1. Child chunk with embeddings
interface ChildChunkWithEmbedding {
  id: string;
  content: string;
  tokens: number;
  denseEmbedding: number[]; // 1024-dim vector
  sparseEmbedding: SparseVector; // BM25/SPLADE
  parentChunkId: string;
  metadata: EnrichedMetadata;
  embeddingMetadata: {
    model: string; // "bge-m3:567m"
    provider: string; // "ollama"
    dimensions: number; // 1024
    generatedAt: Date;
    normalizationType?: string; // "l2" | "none"
  };
}

// 2. Summary with embeddings
interface SummaryWithEmbedding {
  id: string; // "summary-{parentChunkId}"
  parentChunkId: string;
  content: string; // Summary text
  denseEmbedding: number[];
  sparseEmbedding: SparseVector;
  embeddingMetadata: {
    model: string;
    provider: string;
    dimensions: number;
    generatedAt: Date;
  };
}

// 3. Hypothetical question with embeddings
interface HypotheticalQuestionWithEmbedding {
  id: string; // "question-{index}-{parentChunkId}"
  parentChunkId: string;
  question: string;
  denseEmbedding: number[];
  sparseEmbedding: SparseVector;
  embeddingMetadata: {
    model: string;
    provider: string;
    dimensions: number;
    generatedAt: Date;
  };
}

// 4. Sparse vector format
interface SparseVector {
  indices: number[]; // Non-zero term indices
  values: number[]; // Term weights
}

// 5. Parent chunk metadata (NO embeddings)
interface ParentChunkMetadata {
  id: string;
  content: string;
  tokens: number;
  childChunkIds: string[];
  metadata: EnrichedMetadata;
  // ❌ NO embedding - stored in MySQL only
}
```

**Tác động nghiệp vụ:**

- **Multiple retrieval entry points**: Child chunks, summaries, questions
- **Better query coverage**: Handle diverse query types
- **Hybrid search**: Dense (semantic) + Sparse (keyword) matching
- **Trade-offs**:
  - Storage: ~6x embeddings (1 child + 1 summary + 3-5 questions per parent)
  - Time: ~2-3s per batch for dense, +20-30% for sparse
  - Accuracy: +10-20% improvement in retrieval quality

---

### YN-2: Multi-Provider Embedding Support

**Độ ưu tiên:** P0 (Cực kỳ quan trọng)

**Mô tả:**
Hệ thống phải hỗ trợ nhiều embedding providers để users có thể chọn provider phù hợp với requirements (cost, quality, privacy).

**Tiêu chí chấp nhận:**

- ✅ **Default provider: Ollama** với model **bge-m3:567m**
- ✅ Support providers: OpenAI, Google, Anthropic, Ollama
- ✅ Configurable via environment variables
- ✅ Factory pattern để dễ dàng add providers mới
- ✅ Consistent interface cho tất cả providers
- ✅ Provider-specific configuration (API keys, base URLs, model names)
- ✅ Fallback mechanism nếu primary provider fails

**Supported Providers & Models:**

| Provider             | Default Model          | Dimensions | Cost        | Privacy    |
| -------------------- | ---------------------- | ---------- | ----------- | ---------- |
| **Ollama** (Default) | bge-m3:567m            | 1024       | FREE        | 100% Local |
| OpenAI               | text-embedding-3-small | 1536       | $0.0001/1K  | Cloud      |
| Google               | text-embedding-004     | 1024       | $0.00001/1K | Cloud      |
| Anthropic            | N/A (no embeddings)    | -          | -           | -          |

**Implementation:**

```typescript
type EmbeddingProvider = 'ollama' | 'openai' | 'google';

interface EmbeddingProviderConfig {
  // Provider selection
  provider: EmbeddingProvider; // Default: 'ollama'

  // Ollama configuration (DEFAULT)
  ollama: {
    baseUrl: string; // Default: 'http://localhost:11434'
    model: string; // Default: 'bge-m3:567m'
    dimensions: number; // Default: 1024
  };

  // OpenAI configuration (optional)
  openai?: {
    apiKey: string;
    baseUrl?: string; // Custom base URL
    model?: string; // Default: 'text-embedding-3-small'
    dimensions?: number; // Default: 1536
  };

  // Google configuration (optional)
  google?: {
    apiKey: string;
    model?: string; // Default: 'text-embedding-004'
    dimensions?: number; // Default: 1024
  };
}
```

**Tác động nghiệp vụ:**

- Users có thể chọn provider dựa trên trade-offs:
  - **Ollama**: Free, local, private, good quality
  - **OpenAI**: High quality, có chi phí, cloud-based
  - **Google**: Very cheap, good quality, cloud-based
- Easy migration giữa providers khi cần
- Có thể A/B test different models

---

### YN-3: Batch Processing Optimization

**Độ ưu tiên:** P0 (Cực kỳ quan trọng)

**Mô tả:**
Hệ thống phải batch process chunks để tối ưu throughput và giảm latency.

**Tiêu chí chấp nhận:**

- ✅ Batch size configurable (default: 32 chunks per batch)
- ✅ Parallel batches processing khi có nhiều chunks
- ✅ Tối đa 3 concurrent batches để tránh overload
- ✅ Progress tracking: log % completion sau mỗi batch
- ✅ Timeout per batch: 30 seconds
- ✅ Retry failed batches với exponential backoff
- ✅ Preserve order: output chunks theo thứ tự input

**Batch Processing Strategy:**

```typescript
interface BatchProcessingConfig {
  batchSize: number; // Default: 32 chunks
  maxConcurrentBatches: number; // Default: 3
  timeoutPerBatch: number; // Default: 30000ms
  retryAttempts: number; // Default: 3
  retryDelayMs: number; // Default: 1000ms (exponential backoff)
}

// Example: 100 child chunks
// → 4 batches: [32, 32, 32, 4]
// → Process 3 batches concurrently, then 1 remaining batch
// → Total time: ~3-6 seconds (vs ~10-15s sequential)
```

**Tác động nghiệp vụ:**

- Throughput: ~1000 chunks/minute (vs ~100 chunks/minute sequential)
- Latency: <5s cho 100 chunks (batch 32, 3 concurrent)
- Resource utilization: Optimize CPU/GPU usage

---

### YN-4: Error Handling & Retry Logic

**Độ ưu tiên:** P0 (Cực kỳ quan trọng)

**Mô tả:**
Hệ thống phải xử lý errors gracefully và retry khi có thể, không fail toàn bộ job vì một vài chunks lỗi.

**Tiêu chí chấp nhận:**

- ✅ Retry failed embeddings up to 3 times với exponential backoff
- ✅ Log tất cả errors với context (chunkId, attempt, error message)
- ✅ Nếu chunk fails sau 3 retries → mark chunk as "failed", không block job
- ✅ Continue processing remaining chunks khi một chunk fails
- ✅ Final summary: tổng số chunks processed, failed, success rate
- ✅ Không fail job nếu ≥95% chunks thành công
- ✅ Fail job chỉ khi <95% chunks thành công

**Error Types & Handling:**

| Error Type      | Retry? | Max Attempts | Fallback                         |
| --------------- | ------ | ------------ | -------------------------------- |
| Network timeout | ✅     | 3            | Exponential backoff (1s, 2s, 4s) |
| API rate limit  | ✅     | 3            | Backoff with rate limit headers  |
| Invalid input   | ❌     | 0            | Skip chunk, log error            |
| Model not found | ❌     | 0            | Fail job (critical error)        |
| Out of memory   | ❌     | 0            | Reduce batch size, retry         |

**Implementation:**

```typescript
interface EmbeddingResult {
  success: boolean;
  chunkId: string;
  embedding?: number[];
  error?: {
    type: string;
    message: string;
    attempts: number;
  };
}

interface BatchResult {
  totalChunks: number;
  successCount: number;
  failedCount: number;
  results: EmbeddingResult[];
  successRate: number; // successCount / totalChunks
}
```

**Tác động nghiệp vụ:**

- Resilience: Jobs không fail vì transient errors
- Visibility: Clear error logs để debug
- Partial success: Có thể proceed với 95% chunks thành công

---

### YN-5: Progress Tracking & Monitoring

**Độ ưu tiên:** P1 (Cao)

**Mô tả:**
Hệ thống phải provide visibility về embedding generation progress để users biết job status.

**Tiêu chí chấp nhận:**

- ✅ Log progress sau mỗi batch: "Embedded 32/100 chunks (32%)"
- ✅ Track thời gian: start time, end time, duration
- ✅ Track throughput: chunks/second, batches/second
- ✅ Track success rate: % chunks embedded successfully
- ✅ Track provider-specific metrics: API calls, tokens used (for paid providers)
- ✅ Expose metrics qua logging hoặc metrics endpoint (future)

**Implementation:**

```typescript
interface EmbeddingProgress {
  stage: 'embed';
  documentId: string;
  totalChildChunks: number;
  processedChunks: number;
  successfulChunks: number;
  failedChunks: number;
  progressPercentage: number; // processedChunks / totalChildChunks
  startTime: Date;
  estimatedEndTime?: Date;
  provider: string;
  model: string;
}

// Log example:
// [Embed Stage] Processing document abc-123
// [Embed Stage] Provider: ollama, Model: bge-m3:567m
// [Embed Stage] Total child chunks: 100, Batch size: 32
// [Embed Stage] Batch 1/4 completed: 32/100 chunks (32%) - 2.1s
// [Embed Stage] Batch 2/4 completed: 64/100 chunks (64%) - 1.9s
// [Embed Stage] Batch 3/4 completed: 96/100 chunks (96%) - 2.0s
// [Embed Stage] Batch 4/4 completed: 100/100 chunks (100%) - 0.5s
// [Embed Stage] Completed: 100 chunks in 6.5s (15.4 chunks/s, 100% success)
```

**Tác động nghiệp vụ:**

- Visibility: Users biết job đang chạy, không phải guess
- Debugging: Dễ dàng identify bottlenecks
- Monitoring: Track performance metrics over time

---

### YN-6: Sparse Embeddings Support (REQUIRED)

**Độ ưu tiên:** P0 (Cực kỳ quan trọng)

**Mô tả:**
Hệ thống **phải** generate sparse embeddings (BM25/SPLADE) song song với dense embeddings để hỗ trợ hybrid search - kết hợp semantic search (dense) và keyword search (sparse).

**Tiêu chí chấp nhận:**

- ✅ **REQUIRED**: All vectors (child chunks, summaries, questions) phải có sparse embeddings
- ✅ Default method: **BM25** (algorithmic, fast, no model required)
- ✅ Optional method: **SPLADE** (neural, higher quality, requires model)
- ✅ Configurable: `SPARSE_EMBEDDINGS_METHOD=bm25|splade` (default: bm25)
- ✅ Generate sparse vectors song song với dense vectors
- ✅ Store sparse vectors in Qdrant named vectors (separate from dense)
- ✅ Graceful handling: Nếu sparse generation fails → log error, continue với dense only

**Sparse Embedding Methods:**

**1. BM25 (DEFAULT - Algorithmic):**

```typescript
// Classical IR scoring - no model required
interface BM25SparseVector {
  indices: number[];   // Vocabulary term indices
  values: number[];    // BM25 scores
}

// Implementation:
// 1. Tokenize text
// 2. Build vocabulary (term → index mapping)
// 3. Calculate BM25 score per term
// 4. Return sparse vector (indices + values)

// Example:
{
  indices: [123, 456, 789],      // Terms: "machine", "learning", "algorithm"
  values: [2.1, 1.8, 1.5]        // BM25 scores
}

// Pros: Fast, no model required, interpretable
// Cons: Lower quality than SPLADE
```

**2. SPLADE (OPTIONAL - Neural):**

```typescript
// Requires SPLADE model (e.g., naver/splade-cocondenser-ensembledistil)
interface SPLADESparseVector {
  indices: number[];   // Non-zero term indices
  values: number[];    // Term weights (0-1)
}

// Implementation:
// 1. Load SPLADE model
// 2. Encode text → sparse vector
// 3. Return indices and values

// Example:
{
  indices: [123, 456, 789, 1024],  // Expanded terms (including synonyms)
  values: [0.8, 0.6, 0.4, 0.3]     // Neural weights
}

// Pros: Higher quality, term expansion
// Cons: Requires model, slower
```

**Vocabulary Management:**

```typescript
// Global vocabulary for BM25
interface Vocabulary {
  termToIndex: Map<string, number>; // "machine" → 123
  indexToTerm: Map<number, string>; // 123 → "machine"
  documentFrequencies: Map<string, number>; // IDF calculation
  totalDocuments: number;
}

// Build during embedding phase
// Store in Redis for fast lookup
// Update incrementally as new documents indexed
```

**Tác động nghiệp vụ:**

- **Pros**:
  - Hybrid search (dense + sparse) → retrieval accuracy tăng 15-30%
  - Better keyword matching (exact term search)
  - Better handling of rare terms and domain-specific vocabulary
- **Cons**:
  - Processing time tăng ~20-30%
  - Storage tăng ~10% (sparse vectors smaller than dense)
  - Vocabulary management overhead (BM25)
- **Recommendation**: **Required** for production-grade retrieval quality

---

## Đặc tả chức năng

### ĐC-1: Embedding Provider Factory

**Mục đích:** Tạo factory pattern để dễ dàng switch giữa các embedding providers

**Implementation:**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OllamaEmbeddings } from '@langchain/ollama';
import { OpenAIEmbeddings } from '@langchain/openai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import type { Embeddings } from '@langchain/core/embeddings';

type EmbeddingProvider = 'ollama' | 'openai' | 'google';

@Injectable()
export class EmbeddingProviderFactory {
  private readonly logger = new Logger(EmbeddingProviderFactory.name);

  constructor(private configService: ConfigService) {}

  /**
   * Tạo embedding model dựa trên provider được chọn
   * @param provider - Provider name (ollama, openai, google)
   * @returns Embeddings instance from LangChain
   */
  createEmbeddingModel(provider?: EmbeddingProvider): Embeddings {
    const selectedProvider =
      provider ||
      this.configService.get<EmbeddingProvider>('EMBEDDING_PROVIDER') ||
      'ollama';

    this.logger.log(
      `Creating embedding model for provider: ${selectedProvider}`,
    );

    switch (selectedProvider) {
      case 'openai':
        return this.createOpenAIEmbeddings();

      case 'google':
        return this.createGoogleEmbeddings();

      case 'ollama':
      default:
        return this.createOllamaEmbeddings();
    }
  }

  /**
   * Create Ollama embeddings (DEFAULT)
   * Model: bge-m3:567m (1024-dim, local, free)
   */
  private createOllamaEmbeddings(): Embeddings {
    const baseUrl =
      this.configService.get('OLLAMA_BASE_URL') || 'http://localhost:11434';
    const model =
      this.configService.get('OLLAMA_EMBEDDING_MODEL') || 'bge-m3:567m';

    this.logger.log(`Ollama embeddings: ${baseUrl}, model: ${model}`);

    return new OllamaEmbeddings({
      model,
      baseUrl,
    });
  }

  /**
   * Create OpenAI embeddings
   * Model: text-embedding-3-small (1536-dim, $0.0001/1K tokens)
   */
  private createOpenAIEmbeddings(): Embeddings {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI embeddings');
    }

    const baseURL =
      this.configService.get('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    const model =
      this.configService.get('OPENAI_EMBEDDING_MODEL') ||
      'text-embedding-3-small';

    this.logger.log(`OpenAI embeddings: ${baseURL}, model: ${model}`);

    return new OpenAIEmbeddings({
      modelName: model,
      openAIApiKey: apiKey,
      configuration: {
        baseURL,
      },
    });
  }

  /**
   * Create Google embeddings
   * Model: text-embedding-004 (1024-dim, $0.00001/1K tokens)
   */
  private createGoogleEmbeddings(): Embeddings {
    const apiKey = this.configService.get('GOOGLE_API_KEY');
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required for Google embeddings');
    }

    const model =
      this.configService.get('GOOGLE_EMBEDDING_MODEL') || 'text-embedding-004';

    this.logger.log(`Google embeddings: model: ${model}`);

    return new GoogleGenerativeAIEmbeddings({
      model,
      apiKey,
    });
  }

  /**
   * Get embedding model dimensions
   * Useful for validation and Qdrant collection setup
   */
  getEmbeddingDimensions(provider?: EmbeddingProvider): number {
    const selectedProvider =
      provider ||
      this.configService.get<EmbeddingProvider>('EMBEDDING_PROVIDER') ||
      'ollama';

    switch (selectedProvider) {
      case 'openai':
        const openaiModel =
          this.configService.get('OPENAI_EMBEDDING_MODEL') ||
          'text-embedding-3-small';
        // text-embedding-3-small: 1536, text-embedding-3-large: 3072
        return openaiModel.includes('large') ? 3072 : 1536;

      case 'google':
        // text-embedding-004: 1024
        return 1024;

      case 'ollama':
      default:
        const ollamaModel =
          this.configService.get('OLLAMA_EMBEDDING_MODEL') || 'bge-m3:567m';
        // bge-m3: 1024, llama2: 4096, etc.
        return ollamaModel.includes('bge-m3') ? 1024 : 1024; // Default to 1024
    }
  }
}
```

---

### ĐC-2: Embedding Generation Service

**Mục đích:** Generate embeddings cho child chunks với batch processing và retry logic

**Implementation:**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Embeddings } from '@langchain/core/embeddings';
import { EmbeddingProviderFactory } from './embedding-provider.factory';

interface EmbeddingResult {
  success: boolean;
  chunkId: string;
  embedding?: number[];
  error?: {
    type: string;
    message: string;
    attempts: number;
  };
}

interface BatchResult {
  totalChunks: number;
  successCount: number;
  failedCount: number;
  results: EmbeddingResult[];
  successRate: number;
  durationMs: number;
}

@Injectable()
export class EmbeddingGenerationService {
  private readonly logger = new Logger(EmbeddingGenerationService.name);
  private embeddingModel: Embeddings;
  private readonly batchSize: number;
  private readonly maxConcurrentBatches: number;
  private readonly timeoutPerBatch: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;

  constructor(
    private configService: ConfigService,
    private embeddingProviderFactory: EmbeddingProviderFactory,
  ) {
    // Initialize embedding model via factory
    this.embeddingModel = this.embeddingProviderFactory.createEmbeddingModel();

    // Load configuration
    this.batchSize = this.configService.get('EMBEDDING_BATCH_SIZE') || 32;
    this.maxConcurrentBatches =
      this.configService.get('EMBEDDING_MAX_CONCURRENT_BATCHES') || 3;
    this.timeoutPerBatch =
      this.configService.get('EMBEDDING_TIMEOUT_PER_BATCH') || 30000;
    this.retryAttempts =
      this.configService.get('EMBEDDING_RETRY_ATTEMPTS') || 3;
    this.retryDelayMs =
      this.configService.get('EMBEDDING_RETRY_DELAY_MS') || 1000;

    this.logger.log(
      `Embedding service initialized: ` +
        `batch=${this.batchSize}, ` +
        `concurrent=${this.maxConcurrentBatches}, ` +
        `timeout=${this.timeoutPerBatch}ms`,
    );
  }

  /**
   * Generate embeddings for child chunks with batch processing
   * @param childChunks - Array of enriched child chunks
   * @returns BatchResult with embeddings and metadata
   */
  async generateEmbeddings(
    childChunks: EnrichedChildChunk[],
  ): Promise<BatchResult> {
    const startTime = Date.now();
    this.logger.log(
      `Starting embedding generation for ${childChunks.length} child chunks`,
    );

    // Split into batches
    const batches = this.createBatches(childChunks, this.batchSize);
    this.logger.log(
      `Split into ${batches.length} batches (size: ${this.batchSize})`,
    );

    // Process batches with concurrency control
    const results: EmbeddingResult[] = [];
    for (let i = 0; i < batches.length; i += this.maxConcurrentBatches) {
      const batchGroup = batches.slice(i, i + this.maxConcurrentBatches);

      const groupResults = await Promise.all(
        batchGroup.map((batch, idx) =>
          this.processBatch(batch, i + idx + 1, batches.length),
        ),
      );

      // Flatten results
      results.push(...groupResults.flat());

      // Log progress
      const processed = results.length;
      const percentage = Math.round((processed / childChunks.length) * 100);
      this.logger.log(
        `Progress: ${processed}/${childChunks.length} chunks (${percentage}%)`,
      );
    }

    const durationMs = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;
    const successRate = successCount / childChunks.length;

    this.logger.log(
      `Embedding generation completed: ` +
        `${successCount} success, ${failedCount} failed, ` +
        `${successRate.toFixed(2)}% success rate, ` +
        `${durationMs}ms (${(childChunks.length / (durationMs / 1000)).toFixed(
          1,
        )} chunks/s)`,
    );

    return {
      totalChunks: childChunks.length,
      successCount,
      failedCount,
      results,
      successRate,
      durationMs,
    };
  }

  /**
   * Process a single batch of chunks
   */
  private async processBatch(
    chunks: EnrichedChildChunk[],
    batchNumber: number,
    totalBatches: number,
  ): Promise<EmbeddingResult[]> {
    const batchStartTime = Date.now();
    this.logger.log(
      `Processing batch ${batchNumber}/${totalBatches} (${chunks.length} chunks)`,
    );

    const results: EmbeddingResult[] = [];

    for (const chunk of chunks) {
      const result = await this.embedChunkWithRetry(chunk);
      results.push(result);
    }

    const batchDurationMs = Date.now() - batchStartTime;
    const successCount = results.filter((r) => r.success).length;
    this.logger.log(
      `Batch ${batchNumber}/${totalBatches} completed: ` +
        `${successCount}/${chunks.length} success, ${batchDurationMs}ms`,
    );

    return results;
  }

  /**
   * Embed a single chunk with retry logic
   */
  private async embedChunkWithRetry(
    chunk: EnrichedChildChunk,
    attempt: number = 1,
  ): Promise<EmbeddingResult> {
    try {
      // Call LangChain embedQuery method
      const embedding = await Promise.race([
        this.embeddingModel.embedQuery(chunk.content),
        this.createTimeout(this.timeoutPerBatch),
      ]);

      // Validate embedding
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Invalid embedding response');
      }

      return {
        success: true,
        chunkId: chunk.id,
        embedding,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to embed chunk ${chunk.id} (attempt ${attempt}/${this.retryAttempts}): ${error.message}`,
      );

      // Retry logic
      if (attempt < this.retryAttempts) {
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
        await this.sleep(delay);
        return this.embedChunkWithRetry(chunk, attempt + 1);
      }

      // Final failure after all retries
      return {
        success: false,
        chunkId: chunk.id,
        error: {
          type: error.name || 'EmbeddingError',
          message: error.message,
          attempts: attempt,
        },
      };
    }
  }

  /**
   * Split array into batches
   */
  private createBatches<T>(array: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      batches.push(array.slice(i, i + size));
    }
    return batches;
  }

  /**
   * Create timeout promise
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Embedding timeout')), ms);
    });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

### ĐC-3: Sparse Embedding Generation Service

**Mục đích:** Generate sparse embeddings (BM25/SPLADE) cho hybrid search

**Implementation:**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SparseEmbeddingMethod = 'bm25' | 'splade';

interface SparseVector {
  indices: number[]; // Term indices
  values: number[]; // Term weights
}

interface Vocabulary {
  termToIndex: Map<string, number>;
  indexToTerm: Map<number, string>;
  documentFrequencies: Map<string, number>;
  totalDocuments: number;
}

@Injectable()
export class SparseEmbeddingService {
  private readonly logger = new Logger(SparseEmbeddingService.name);
  private readonly method: SparseEmbeddingMethod;
  private vocabulary: Vocabulary;

  // BM25 parameters
  private readonly k1 = 1.5; // Term frequency saturation parameter
  private readonly b = 0.75; // Length normalization parameter
  private avgDocLength = 0;

  constructor(private configService: ConfigService) {
    this.method =
      this.configService.get<SparseEmbeddingMethod>(
        'SPARSE_EMBEDDINGS_METHOD',
      ) || 'bm25';

    this.vocabulary = {
      termToIndex: new Map(),
      indexToTerm: new Map(),
      documentFrequencies: new Map(),
      totalDocuments: 0,
    };

    this.logger.log(
      `Sparse embedding service initialized with method: ${this.method}`,
    );
  }

  /**
   * Generate sparse embedding for text
   */
  async generateSparseEmbedding(text: string): Promise<SparseVector> {
    switch (this.method) {
      case 'splade':
        return this.generateSPLADEEmbedding(text);

      case 'bm25':
      default:
        return this.generateBM25Embedding(text);
    }
  }

  /**
   * Generate BM25 sparse vector (DEFAULT)
   */
  private generateBM25Embedding(text: string): SparseVector {
    // 1. Tokenize
    const tokens = this.tokenize(text);
    const termFrequencies = this.calculateTermFrequencies(tokens);

    // 2. Calculate BM25 scores
    const indices: number[] = [];
    const values: number[] = [];
    const docLength = tokens.length;

    for (const [term, tf] of termFrequencies.entries()) {
      // Get or create term index
      let termIndex = this.vocabulary.termToIndex.get(term);
      if (termIndex === undefined) {
        termIndex = this.vocabulary.termToIndex.size;
        this.vocabulary.termToIndex.set(term, termIndex);
        this.vocabulary.indexToTerm.set(termIndex, term);
      }

      // Calculate IDF
      const df = this.vocabulary.documentFrequencies.get(term) || 1;
      const idf = Math.log(
        (this.vocabulary.totalDocuments - df + 0.5) / (df + 0.5) + 1,
      );

      // Calculate BM25 score
      const score =
        idf *
        ((tf * (this.k1 + 1)) /
          (tf +
            this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength))));

      if (score > 0) {
        indices.push(termIndex);
        values.push(score);
      }
    }

    return { indices, values };
  }

  /**
   * Generate SPLADE sparse vector (OPTIONAL - requires model)
   */
  private async generateSPLADEEmbedding(text: string): Promise<SparseVector> {
    // TODO: Implement SPLADE using neural model
    // For now, fallback to BM25
    this.logger.warn('SPLADE not implemented yet, falling back to BM25');
    return this.generateBM25Embedding(text);
  }

  /**
   * Tokenize text into terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter((token) => token.length > 2); // Remove short tokens
  }

  /**
   * Calculate term frequencies
   */
  private calculateTermFrequencies(tokens: string[]): Map<string, number> {
    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) || 0) + 1);
    }
    return frequencies;
  }

  /**
   * Update vocabulary with new document
   */
  updateVocabulary(text: string): void {
    const tokens = this.tokenize(text);
    const uniqueTerms = new Set(tokens);

    for (const term of uniqueTerms) {
      const currentDf = this.vocabulary.documentFrequencies.get(term) || 0;
      this.vocabulary.documentFrequencies.set(term, currentDf + 1);
    }

    this.vocabulary.totalDocuments++;

    // Update average document length
    this.avgDocLength =
      (this.avgDocLength * (this.vocabulary.totalDocuments - 1) +
        tokens.length) /
      this.vocabulary.totalDocuments;
  }

  /**
   * Get vocabulary stats
   */
  getVocabularyStats(): {
    totalTerms: number;
    totalDocuments: number;
    avgDocLength: number;
  } {
    return {
      totalTerms: this.vocabulary.termToIndex.size,
      totalDocuments: this.vocabulary.totalDocuments,
      avgDocLength: this.avgDocLength,
    };
  }
}
```

---

### ĐC-4: Multi-Vector Embedding Orchestrator

**Mục đích:** Điều phối toàn bộ Embed Stage workflow với multi-vector embeddings

**Implementation:**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingGenerationService } from './embedding-generation.service';
import { SparseEmbeddingService } from './sparse-embedding.service';
import { EmbeddingProviderFactory } from './embedding-provider.factory';

interface EmbedInputDto {
  enrichedParents: EnrichedParentChunk[];
  enrichedChildren: EnrichedChildChunk[];
  documentId: string;
  metadata: {
    totalParents: number;
    totalChildren: number;
  };
}

interface EmbedOutputDto {
  // Multi-vector embeddings
  embeddedChildren: ChildChunkWithEmbedding[];
  embeddedSummaries?: SummaryWithEmbedding[]; // If summaries enabled
  embeddedQuestions?: HypotheticalQuestionWithEmbedding[]; // If questions enabled

  // Metadata
  parentChunksMetadata: ParentChunkMetadata[];
  embeddingMetadata: {
    provider: string;
    model: string;
    dimensions: number;
    sparseMethod: string; // "bm25" | "splade"

    // Counts
    totalChildren: number;
    embeddedChildrenCount: number;
    embeddedSummariesCount: number;
    embeddedQuestionsCount: number;
    failedCount: number;

    // Performance
    successRate: number;
    durationMs: number;
  };
  errors: string[];
}

@Injectable()
export class EmbedStageService {
  private readonly logger = new Logger(EmbedStageService.name);

  constructor(
    private embeddingGenerationService: EmbeddingGenerationService,
    private sparseEmbeddingService: SparseEmbeddingService,
    private embeddingProviderFactory: EmbeddingProviderFactory,
    private configService: ConfigService,
  ) {}

  /**
   * Execute Multi-Vector Embed Stage workflow
   */
  async execute(input: EmbedInputDto): Promise<EmbedOutputDto> {
    this.logger.log(
      `Starting Multi-Vector Embed Stage for document ${input.documentId}: ` +
        `${input.enrichedChildren.length} child chunks, ` +
        `${input.enrichedParents.length} parent chunks`,
    );

    const startTime = Date.now();
    const errors: string[] = [];

    // 1. Embed child chunks (dense + sparse) - REQUIRED
    this.logger.log('Step 1: Embedding child chunks (dense + sparse)');
    const embeddedChildren = await this.embedChildChunks(
      input.enrichedChildren,
      errors,
    );

    // 2. Embed summaries (dense + sparse) - If enabled
    const summariesEnabled = this.configService.get<boolean>(
      'SUMMARY_GENERATION_ENABLED',
    );
    let embeddedSummaries: SummaryWithEmbedding[] | undefined;
    if (summariesEnabled) {
      this.logger.log('Step 2: Embedding summaries (dense + sparse)');
      embeddedSummaries = await this.embedSummaries(
        input.enrichedParents,
        errors,
      );
    }

    // 3. Embed hypothetical questions (dense + sparse) - If enabled
    const questionsEnabled = this.configService.get<boolean>(
      'HYPOTHETICAL_QUESTIONS_ENABLED',
    );
    let embeddedQuestions: HypotheticalQuestionWithEmbedding[] | undefined;
    if (questionsEnabled) {
      this.logger.log(
        'Step 3: Embedding hypothetical questions (dense + sparse)',
      );
      embeddedQuestions = await this.embedHypotheticalQuestions(
        input.enrichedParents,
        errors,
      );
    }

    // 4. Pass through parent chunks metadata (no embeddings)
    const parentChunksMetadata: ParentChunkMetadata[] =
      input.enrichedParents.map((parent) => ({
        id: parent.id,
        content: parent.content,
        tokens: parent.tokens,
        childChunkIds: parent.childChunkIds || [],
        metadata: parent.metadata,
      }));

    const durationMs = Date.now() - startTime;

    // Calculate success rate
    const totalVectorsAttempted =
      input.enrichedChildren.length +
      (embeddedSummaries?.length || 0) +
      (embeddedQuestions?.length || 0);
    const totalVectorsEmbedded =
      embeddedChildren.length +
      (embeddedSummaries?.length || 0) +
      (embeddedQuestions?.length || 0);
    const successRate = totalVectorsEmbedded / totalVectorsAttempted;

    // Check success rate
    if (successRate < 0.95) {
      throw new Error(
        `Multi-vector embedding failed: only ${totalVectorsEmbedded}/${totalVectorsAttempted} vectors succeeded`,
      );
    }

    this.logger.log(
      `Multi-Vector Embed Stage completed: ` +
        `${embeddedChildren.length} child chunks, ` +
        `${embeddedSummaries?.length || 0} summaries, ` +
        `${embeddedQuestions?.length || 0} questions, ` +
        `${parentChunksMetadata.length} parent metadata, ` +
        `${errors.length} errors, ${durationMs}ms`,
    );

    return {
      embeddedChildren,
      embeddedSummaries,
      embeddedQuestions,
      parentChunksMetadata,
      embeddingMetadata: {
        provider: this.configService.get('EMBEDDING_PROVIDER') || 'ollama',
        model:
          this.configService.get('OLLAMA_EMBEDDING_MODEL') || 'bge-m3:567m',
        dimensions: this.embeddingProviderFactory.getEmbeddingDimensions(),
        sparseMethod:
          this.configService.get('SPARSE_EMBEDDINGS_METHOD') || 'bm25',
        totalChildren: input.enrichedChildren.length,
        embeddedChildrenCount: embeddedChildren.length,
        embeddedSummariesCount: embeddedSummaries?.length || 0,
        embeddedQuestionsCount: embeddedQuestions?.length || 0,
        failedCount: totalVectorsAttempted - totalVectorsEmbedded,
        successRate,
        durationMs,
      },
      errors,
    };
  }

  /**
   * Embed child chunks (dense + sparse)
   */
  private async embedChildChunks(
    childChunks: EnrichedChildChunk[],
    errors: string[],
  ): Promise<ChildChunkWithEmbedding[]> {
    const embeddedChildren: ChildChunkWithEmbedding[] = [];

    // Generate dense embeddings via batch processing
    const batchResult =
      await this.embeddingGenerationService.generateEmbeddings(childChunks);

    for (const result of batchResult.results) {
      if (result.success) {
        const originalChunk = childChunks.find((c) => c.id === result.chunkId);
        if (originalChunk) {
          // Generate sparse embedding
          const sparseEmbedding =
            await this.sparseEmbeddingService.generateSparseEmbedding(
              originalChunk.content,
            );

          // Update vocabulary
          this.sparseEmbeddingService.updateVocabulary(originalChunk.content);

          embeddedChildren.push({
            ...originalChunk,
            denseEmbedding: result.embedding!,
            sparseEmbedding,
            embeddingMetadata: {
              model:
                this.configService.get('OLLAMA_EMBEDDING_MODEL') ||
                'bge-m3:567m',
              provider:
                this.configService.get('EMBEDDING_PROVIDER') || 'ollama',
              dimensions: result.embedding!.length,
              generatedAt: new Date(),
              normalizationType: 'none',
            },
          });
        }
      } else {
        errors.push(`Child chunk ${result.chunkId}: ${result.error?.message}`);
      }
    }

    return embeddedChildren;
  }

  /**
   * Embed summaries (dense + sparse)
   */
  private async embedSummaries(
    parentChunks: EnrichedParentChunk[],
    errors: string[],
  ): Promise<SummaryWithEmbedding[]> {
    const embeddedSummaries: SummaryWithEmbedding[] = [];

    for (const parent of parentChunks) {
      if (!parent.summary) continue;

      try {
        // Generate dense embedding
        const denseEmbedding =
          await this.embeddingGenerationService.generateEmbeddings([
            { id: parent.id, content: parent.summary } as EnrichedChildChunk,
          ]);

        if (denseEmbedding.results[0]?.success) {
          // Generate sparse embedding
          const sparseEmbedding =
            await this.sparseEmbeddingService.generateSparseEmbedding(
              parent.summary,
            );

          this.sparseEmbeddingService.updateVocabulary(parent.summary);

          embeddedSummaries.push({
            id: `summary-${parent.id}`,
            parentChunkId: parent.id,
            content: parent.summary,
            denseEmbedding: denseEmbedding.results[0].embedding!,
            sparseEmbedding,
            embeddingMetadata: {
              model:
                this.configService.get('OLLAMA_EMBEDDING_MODEL') ||
                'bge-m3:567m',
              provider:
                this.configService.get('EMBEDDING_PROVIDER') || 'ollama',
              dimensions: denseEmbedding.results[0].embedding!.length,
              generatedAt: new Date(),
            },
          });
        }
      } catch (error) {
        errors.push(`Summary for parent ${parent.id}: ${error.message}`);
      }
    }

    return embeddedSummaries;
  }

  /**
   * Embed hypothetical questions (dense + sparse)
   */
  private async embedHypotheticalQuestions(
    parentChunks: EnrichedParentChunk[],
    errors: string[],
  ): Promise<HypotheticalQuestionWithEmbedding[]> {
    const embeddedQuestions: HypotheticalQuestionWithEmbedding[] = [];

    for (const parent of parentChunks) {
      if (
        !parent.hypotheticalQuestions ||
        parent.hypotheticalQuestions.length === 0
      )
        continue;

      for (let i = 0; i < parent.hypotheticalQuestions.length; i++) {
        const question = parent.hypotheticalQuestions[i];

        try {
          // Generate dense embedding
          const denseEmbedding =
            await this.embeddingGenerationService.generateEmbeddings([
              {
                id: `${parent.id}-q${i}`,
                content: question,
              } as EnrichedChildChunk,
            ]);

          if (denseEmbedding.results[0]?.success) {
            // Generate sparse embedding
            const sparseEmbedding =
              await this.sparseEmbeddingService.generateSparseEmbedding(
                question,
              );

            this.sparseEmbeddingService.updateVocabulary(question);

            embeddedQuestions.push({
              id: `question-${i}-${parent.id}`,
              parentChunkId: parent.id,
              question,
              denseEmbedding: denseEmbedding.results[0].embedding!,
              sparseEmbedding,
              embeddingMetadata: {
                model:
                  this.configService.get('OLLAMA_EMBEDDING_MODEL') ||
                  'bge-m3:567m',
                provider:
                  this.configService.get('EMBEDDING_PROVIDER') || 'ollama',
                dimensions: denseEmbedding.results[0].embedding!.length,
                generatedAt: new Date(),
              },
            });
          }
        } catch (error) {
          errors.push(
            `Question ${i} for parent ${parent.id}: ${error.message}`,
          );
        }
      }
    }

    return embeddedQuestions;
  }
}
```

---

## Điểm tích hợp

### 1. Enrich Stage (Input)

**Protocol:** LangGraph state transition

**Input State:**

```typescript
{
  enrichedParents: EnrichedParentChunk[];
  enrichedChildren: EnrichedChildChunk[];
  enrichmentMetadata: {
    totalParents: number;
    totalChildren: number;
    durationMs: number;
    llmEnrichmentUsed: boolean;
  };
  currentStage: 'enrich';
}
```

**What Embed Stage needs:**

- `enrichedChildren` - Array of child chunks to embed (400 tokens each)
- `enrichedParents` - Array of parent chunks (will be passed through without embeddings)
- Document metadata for logging and tracking

---

### 2. Persist Stage (Output)

**Protocol:** LangGraph state transition

**Output State:**

```typescript
{
  ...inputState,

  // Multi-vector embeddings
  embeddedChildren: ChildChunkWithEmbedding[];  // Dense + sparse
  embeddedSummaries?: SummaryWithEmbedding[];    // Dense + sparse (if enabled)
  embeddedQuestions?: HypotheticalQuestionWithEmbedding[];  // Dense + sparse (if enabled)

  // Metadata
  parentChunksMetadata: ParentChunkMetadata[];
  embeddingMetadata: {
    provider: string;
    model: string;
    dimensions: number;
    sparseMethod: string;  // "bm25" | "splade"

    totalChildren: number;
    embeddedChildrenCount: number;
    embeddedSummariesCount: number;
    embeddedQuestionsCount: number;
    failedCount: number;

    successRate: number;
    durationMs: number;
  };
  currentStage: 'embed';
  errors: string[];
}
```

**What Persist Stage will do:**

- Store multiple vector collections in Qdrant:
  - `documents_children`: Child chunks with dense + sparse vectors
  - `documents_summaries`: Summaries with dense + sparse vectors (if enabled)
  - `documents_questions`: Questions with dense + sparse vectors (if enabled)
- Store both `embeddedChildren` and `parentChunksMetadata` in MySQL (chunks + lineage)

---

## Luồng dữ liệu

### Happy Path

```
1. Embed Stage bắt đầu với state từ Enrich Stage
   ↓
2. EmbedStageService.execute(state)
   ↓
3. Validate input (enrichedChildren không empty)
   ↓
4. Generate Embeddings (EmbeddingGenerationService):
   ├─ 4.1. Split enrichedChildren into batches (32 chunks per batch)
   ├─ 4.2. Process batches với concurrency control (max 3 concurrent)
   ├─ 4.3. For each chunk:
   │       ├─ Call embeddingModel.embedQuery(chunk.content)
   │       ├─ Retry up to 3 times với exponential backoff nếu fails
   │       └─ Return embedding vector (1024-dim for BGE-M3)
   ├─ 4.4. Collect all results (success + failures)
   └─ 4.5. Return BatchResult với success rate
   ↓
5. Check success rate:
   ├─ If ≥95% success → Continue
   └─ If <95% success → Fail job (critical error)
   ↓
6. Combine embeddings với original chunks:
   ├─ For each successful result:
   │   └─ Create ChildChunkWithEmbedding (chunk + embedding + metadata)
   ├─ For each failed result:
   │   └─ Add to errors array
   └─ Return embeddedChildren array
   ↓
7. Pass through parent chunks metadata (no embeddings):
   └─ Map enrichedParents → ParentChunkMetadata (without embedding field)
   ↓
8. Return EmbedOutputDto:
   ├─ embeddedChildren (child chunks with embeddings)
   ├─ parentChunksMetadata (parent chunks without embeddings)
   ├─ embeddingMetadata (provider, model, dimensions, counts, success rate)
   └─ errors (list of failed chunks)
   ↓
9. Update workflow state
   ↓
10. Transition sang Persist Stage
```

### Error Path - Embedding API Fails

```
1-3. (Same as happy path)
   ↓
4. embedChunkWithRetry() → API call fails
   ↓
5. Retry #1 with 1s delay → Fails again
   ↓
6. Retry #2 with 2s delay → Fails again
   ↓
7. Retry #3 with 4s delay → Fails again
   ↓
8. Mark chunk as failed, add to errors
   ↓
9. Continue processing remaining chunks (graceful degradation)
   ↓
10. If success rate ≥95% → Proceed to Persist Stage
    If success rate <95% → Fail job
```

### Edge Case - Network Timeout

```
1-3. (Same as happy path)
   ↓
4. embedQuery() call → Network timeout (30s)
   ↓
5. Promise.race rejects with "Embedding timeout"
   ↓
6. Catch error, log warning
   ↓
7. Retry với exponential backoff (same as embedding API fails)
   ↓
8. Continue với remaining chunks
```

---

## Chiến lược xử lý lỗi

### Phân loại Lỗi

**1. Transient Errors (Retry):**

```typescript
// Network errors
try {
  embedding = await this.embeddingModel.embedQuery(content);
} catch (error) {
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    logger.warn('Network error, retrying...');
    // Retry with exponential backoff
  }
}

// API rate limits
try {
  embedding = await this.embeddingModel.embedQuery(content);
} catch (error) {
  if (error.status === 429) {
    const retryAfter = error.headers['retry-after'] || 5;
    logger.warn(`Rate limited, retrying after ${retryAfter}s`);
    await sleep(retryAfter * 1000);
    // Retry
  }
}
```

**2. Permanent Errors (No Retry):**

```typescript
// Invalid input
if (!chunk.content || chunk.content.trim().length === 0) {
  logger.error(`Chunk ${chunk.id} has empty content, skipping`);
  return {
    success: false,
    chunkId: chunk.id,
    error: { type: 'InvalidInput', message: 'Empty content' },
  };
}

// Model not found
try {
  embedding = await this.embeddingModel.embedQuery(content);
} catch (error) {
  if (error.message.includes('model not found')) {
    logger.error('Embedding model not found - critical error');
    throw error; // Fail job immediately
  }
}
```

**3. Graceful Degradation:**

```typescript
// Process remaining chunks even if some fail
for (const chunk of chunks) {
  try {
    const result = await this.embedChunkWithRetry(chunk);
    results.push(result);
  } catch (error) {
    logger.error(`Failed to embed chunk ${chunk.id}:`, error);
    results.push({
      success: false,
      chunkId: chunk.id,
      error: { type: 'Unknown', message: error.message },
    });
  }
}

// Check final success rate
if (successRate < 0.95) {
  throw new Error(`Too many failures: ${successRate.toFixed(2)} success rate`);
}
```

---

## Yêu cầu hiệu năng

### Mục tiêu Performance

| Thao tác                            | Mục tiêu         | Chấp nhận được  | Ghi chú                 |
| ----------------------------------- | ---------------- | --------------- | ----------------------- |
| Single chunk embedding (Ollama)     | <50ms            | <100ms          | BGE-M3 local            |
| Single chunk embedding (OpenAI)     | <200ms           | <500ms          | API latency             |
| Batch embedding (32 chunks, Ollama) | <2s              | <5s             | Parallel processing     |
| Batch embedding (32 chunks, OpenAI) | <5s              | <10s            | API batching            |
| Full document (100 child chunks)    | <10s             | <30s            | 4 batches, 3 concurrent |
| Throughput (Ollama)                 | >1000 chunks/min | >500 chunks/min | Batch 32, concurrent 3  |
| Success rate                        | >99%             | >95%            | With retries            |

### Chiến lược Tối ưu

**1. Batch Processing:**

```typescript
// ✅ Process chunks in batches
const batchSize = 32; // Optimal for BGE-M3
const batches = this.createBatches(chunks, batchSize);

// ✅ Concurrent batches (max 3 để tránh overload)
for (let i = 0; i < batches.length; i += 3) {
  const batchGroup = batches.slice(i, i + 3);
  await Promise.all(batchGroup.map((batch) => this.processBatch(batch)));
}
```

**2. Connection Pooling:**

```typescript
// ✅ Reuse embedding model instance (LangChain handles connection pooling)
private embeddingModel: Embeddings;

constructor(private embeddingProviderFactory: EmbeddingProviderFactory) {
  this.embeddingModel = this.embeddingProviderFactory.createEmbeddingModel();
}
```

**3. Timeout Protection:**

```typescript
// ✅ Set timeout per batch để không block indefinitely
const embedding = await Promise.race([
  this.embeddingModel.embedQuery(content),
  this.createTimeout(30000), // 30s timeout
]);
```

**4. Resource Management:**

```typescript
// ✅ Limit concurrent batches to avoid OOM
const maxConcurrentBatches = 3;

// ✅ Monitor memory usage
if (process.memoryUsage().heapUsed > MEMORY_THRESHOLD) {
  logger.warn('High memory usage, reducing batch size');
  batchSize = Math.floor(batchSize / 2);
}
```

---

## Chiến lược kiểm thử

### Unit Tests

**Coverage Target:** 90%

**Test Cases:**

1. **EmbeddingProviderFactory:**

   - Create Ollama embeddings with default config
   - Create OpenAI embeddings with API key
   - Create Google embeddings with API key
   - Throw error khi missing API keys
   - Get correct embedding dimensions per provider

2. **EmbeddingGenerationService:**

   - Generate embeddings for single chunk
   - Generate embeddings for batch of chunks
   - Split chunks into correct batch sizes
   - Process batches concurrently (max 3)
   - Retry failed embeddings với exponential backoff
   - Handle network timeouts gracefully
   - Return correct BatchResult với success rate

3. **EmbedStageService:**
   - Execute full workflow successfully
   - Embed child chunks, pass through parent chunks
   - Fail job khi success rate <95%
   - Collect errors from failed chunks
   - Return correct EmbedOutputDto

---

### Integration Tests

**Test Cases:**

1. **End-to-End Embedding Flow:**

   - Input enriched chunks từ Enrich Stage
   - Generate embeddings successfully
   - Output embedded chunks to Persist Stage
   - Validate embedding dimensions
   - Validate parent chunks passed through without embeddings

2. **Multi-Provider Integration:**

   - Switch between Ollama, OpenAI, Google
   - Verify embeddings generated correctly
   - Verify dimensions match provider specs

3. **Error Scenarios:**
   - Network timeout → Retry → Success
   - API rate limit → Backoff → Success
   - Model not found → Fail job immediately
   - 10% chunks fail → Continue (success rate 90% < 95% → fail)
   - 3% chunks fail → Continue (success rate 97% ≥ 95% → success)

---

### Performance Tests

**Test Cases:**

1. **Throughput Test:**

   - Input: 1000 child chunks
   - Expected: <60s (>16 chunks/s)
   - Measure: chunks/second, batches/second

2. **Latency Test:**

   - Input: Single batch (32 chunks)
   - Expected: <5s
   - Measure: p50, p95, p99 latency

3. **Concurrent Load Test:**
   - Input: 3 concurrent batches
   - Expected: No crashes, no OOM
   - Measure: Memory usage, CPU usage

---

## Tiêu chí thành công

### Success Metrics

**1. Functional Correctness:**

- ✅ 100% child chunks có embeddings (nếu success rate ≥95%)
- ✅ 0 parent chunks có embeddings (pass through only)
- ✅ Embedding dimensions correct (1024 for BGE-M3)
- ✅ Embeddings deterministic (same input → same output)

**2. Performance:**

- ✅ <10s cho 100 child chunks (Ollama, batch 32)
- ✅ >500 chunks/min throughput
- ✅ Success rate ≥95% với retries

**3. Reliability:**

- ✅ Graceful degradation khi một số chunks fail
- ✅ No job failures due to transient errors
- ✅ Clear error logging cho debugging

**4. Monitoring:**

- ✅ Progress tracking: % completion logged
- ✅ Performance metrics: throughput, latency
- ✅ Error metrics: failed chunks, retry counts

---

## Các giai đoạn triển khai

### Phase 1: Core Embedding Infrastructure (Tuần 1)

**Deliverables:**

- [ ] EmbedModule structure (NestJS module)
- [ ] EmbeddingProviderFactory (Ollama, OpenAI, Google)
- [ ] Basic embedding generation (single chunk)
- [ ] Unit tests cho factory và single chunk embedding

**Dependencies:**

- LangChain packages: @langchain/ollama, @langchain/openai, @langchain/google-genai
- Enrich Stage completed

---

### Phase 2: Batch Processing & Retry Logic (Tuần 2)

**Deliverables:**

- [ ] EmbeddingGenerationService (batch processing)
- [ ] Retry logic với exponential backoff
- [ ] Timeout protection
- [ ] Concurrent batch processing (max 3)
- [ ] Integration tests

**Dependencies:**

- Phase 1 completed

---

### Phase 3: Orchestration & Integration (Tuần 3)

**Deliverables:**

- [ ] EmbedStageService (orchestrator)
- [ ] LangGraph workflow integration
- [ ] Progress tracking và logging
- [ ] Error handling toàn diện
- [ ] Pass-through parent chunks logic
- [ ] End-to-end tests

**Dependencies:**

- Phase 2 completed
- LangGraph workflow ready

---

### Phase 4: Optimization & Monitoring (Tuần 4)

**Deliverables:**

- [ ] Performance optimization (batch size tuning)
- [ ] Resource management (memory, CPU)
- [ ] Metrics collection và logging
- [ ] Documentation
- [ ] Performance benchmarking

**Dependencies:**

- All phases completed
- Production-like environment for testing

---

## Phụ thuộc & Rủi ro

### External Dependencies

| Dependency              | Purpose           | Risk                 | Mitigation                        |
| ----------------------- | ----------------- | -------------------- | --------------------------------- |
| @langchain/ollama       | Ollama embeddings | Breaking changes     | Pin version, test before upgrade  |
| @langchain/openai       | OpenAI embeddings | API changes          | Pin version, test before upgrade  |
| @langchain/google-genai | Google embeddings | API changes          | Pin version, test before upgrade  |
| Ollama server           | Local embeddings  | Server downtime      | Health checks, restart on failure |
| OpenAI API              | Cloud embeddings  | Rate limits, outages | Retry logic, fallback to Ollama   |
| Google API              | Cloud embeddings  | Rate limits, outages | Retry logic, fallback to Ollama   |

### Technical Risks

| Rủi ro                        | Xác suất   | Tác động   | Giảm thiểu                                   |
| ----------------------------- | ---------- | ---------- | -------------------------------------------- |
| Ollama server crashes         | Trung bình | Cao        | Health checks, auto-restart, error handling  |
| OpenAI rate limits            | Cao        | Trung bình | Retry with backoff, fallback to Ollama       |
| Out of memory (large batches) | Thấp       | Cao        | Limit batch size, monitor memory usage       |
| Network timeouts              | Trung bình | Trung bình | Timeout protection, retry logic              |
| Embedding quality issues      | Thấp       | Cao        | A/B testing, user feedback, switch providers |

---

## Phụ lục

### Phụ lục A: Embedding Model Comparison

| Model                     | Provider | Dimensions | Cost        | Quality   | Privacy    |
| ------------------------- | -------- | ---------- | ----------- | --------- | ---------- |
| **bge-m3:567m** (Default) | Ollama   | 1024       | FREE        | Excellent | 100% Local |
| text-embedding-3-small    | OpenAI   | 1536       | $0.0001/1K  | Excellent | Cloud      |
| text-embedding-3-large    | OpenAI   | 3072       | $0.0002/1K  | Best      | Cloud      |
| text-embedding-004        | Google   | 1024       | $0.00001/1K | Very Good | Cloud      |
| multilingual-e5-large     | Ollama   | 1024       | FREE        | Very Good | 100% Local |

**Recommendation:**

- **Default: bge-m3:567m via Ollama** - Free, local, excellent quality, 1024-dim
- **High Quality: OpenAI text-embedding-3-large** - Best quality, có chi phí
- **Cost Efficient: Google text-embedding-004** - Rẻ nhất, good quality

---

### Phụ lục B: Configuration Reference

#### Environment Variables

```bash
# ============================================
# Embedding Provider Configuration
# ============================================

# Provider Selection
EMBEDDING_PROVIDER=ollama                   # Options: ollama | openai | google (Default: ollama)

# --------------------------------------------
# Ollama Configuration (DEFAULT)
# --------------------------------------------
OLLAMA_BASE_URL=http://localhost:11434      # Ollama server URL
OLLAMA_EMBEDDING_MODEL=bge-m3:567m          # DEFAULT: bge-m3:567m (1024-dim)

# --------------------------------------------
# OpenAI Configuration (Optional)
# --------------------------------------------
OPENAI_API_KEY=sk-...                       # Required if using OpenAI
OPENAI_BASE_URL=https://api.openai.com/v1   # Custom base URL (optional)
OPENAI_EMBEDDING_MODEL=text-embedding-3-small  # Default: text-embedding-3-small (1536-dim)

# --------------------------------------------
# Google Configuration (Optional)
# --------------------------------------------
GOOGLE_API_KEY=...                          # Required if using Google
GOOGLE_EMBEDDING_MODEL=text-embedding-004   # Default: text-embedding-004 (1024-dim)

# ============================================
# Batch Processing Configuration
# ============================================
EMBEDDING_BATCH_SIZE=32                     # Chunks per batch (Default: 32)
EMBEDDING_MAX_CONCURRENT_BATCHES=3          # Max concurrent batches (Default: 3)
EMBEDDING_TIMEOUT_PER_BATCH=30000           # Timeout per batch (ms, Default: 30000)

# ============================================
# Retry Configuration
# ============================================
EMBEDDING_RETRY_ATTEMPTS=3                  # Max retry attempts (Default: 3)
EMBEDDING_RETRY_DELAY_MS=1000               # Initial retry delay (ms, Default: 1000)

# ============================================
# Sparse Embeddings (REQUIRED)
# ============================================
SPARSE_EMBEDDINGS_METHOD=bm25               # Method: splade | bm25 (Default: bm25, REQUIRED)

# BM25 Parameters (if using BM25 method)
BM25_K1=1.5                                 # Term frequency saturation (Default: 1.5)
BM25_B=0.75                                 # Length normalization (Default: 0.75)
```

#### TypeScript Configuration Interface

```typescript
interface EmbedStageConfig {
  // Provider selection
  embeddingProvider: 'ollama' | 'openai' | 'google'; // Default: 'ollama'

  // Provider credentials
  providers: {
    ollama: {
      baseUrl: string; // Default: 'http://localhost:11434'
      model: string; // Default: 'bge-m3:567m'
      dimensions: number; // Default: 1024
    };
    openai?: {
      apiKey: string;
      baseUrl?: string; // Optional custom base URL
      model?: string; // Default: 'text-embedding-3-small'
      dimensions?: number; // Default: 1536
    };
    google?: {
      apiKey: string;
      model?: string; // Default: 'text-embedding-004'
      dimensions?: number; // Default: 1024
    };
  };

  // Batch processing
  batchProcessing: {
    batchSize: number; // Default: 32
    maxConcurrentBatches: number; // Default: 3
    timeoutPerBatch: number; // Default: 30000ms
  };

  // Retry logic
  retry: {
    maxAttempts: number; // Default: 3
    initialDelayMs: number; // Default: 1000ms (exponential backoff)
  };

  // Optional: Sparse embeddings
  sparseEmbeddings?: {
    enabled: boolean; // Default: false
    method: 'splade' | 'bm25'; // Default: 'bm25'
  };
}
```

---

### Phụ lục C: Provider Switching Examples

**Example 1: Default Ollama (Local, Free)**

```bash
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=bge-m3:567m
```

**Example 2: OpenAI (High Quality, Paid)**

```bash
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

**Example 3: Google (Cost Efficient, Paid)**

```bash
EMBEDDING_PROVIDER=google
GOOGLE_API_KEY=...
GOOGLE_EMBEDDING_MODEL=text-embedding-004
```

**Example 4: OpenAI với Fallback to Ollama**

```typescript
// Try OpenAI first
try {
  const openaiEmbeddings = factory.createEmbeddingModel('openai');
  return await openaiEmbeddings.embedQuery(text);
} catch (error) {
  logger.warn('OpenAI failed, falling back to Ollama');
  const ollamaEmbeddings = factory.createEmbeddingModel('ollama');
  return await ollamaEmbeddings.embedQuery(text);
}
```

---

### Phụ lục D: Performance Benchmarks

**Test Environment:**

- CPU: 8 cores
- RAM: 16GB
- Model: BGE-M3 (Ollama local)

**Results:**

| Test Case | Total Chunks | Batch Size | Concurrent Batches | Duration | Throughput    |
| --------- | ------------ | ---------- | ------------------ | -------- | ------------- |
| Small     | 50           | 32         | 2                  | 3.2s     | 15.6 chunks/s |
| Medium    | 200          | 32         | 3                  | 12.5s    | 16.0 chunks/s |
| Large     | 1000         | 32         | 3                  | 58.3s    | 17.2 chunks/s |

**Observations:**

- Batch size 32 optimal for BGE-M3
- Concurrent batches 3 optimal (more → OOM risk)
- Throughput scales linearly với chunk count

---

## Kết luận

Embed Stage được thiết kế với nguyên tắc **Multi-Vector Retrieval + Hybrid Search**:

1. **Multi-Vector Embeddings** - Generate embeddings cho:

   - Child chunks (400 tokens) - REQUIRED
   - Summaries (if enabled) - For high-level concept matching
   - Hypothetical questions (if enabled) - For Q&A style queries

2. **Hybrid Search** - Dense (semantic) + Sparse (keyword) embeddings:

   - Dense: BGE-M3 1024-dim vectors for semantic similarity
   - Sparse: BM25/SPLADE for exact keyword matching
   - **Both required** for production-grade retrieval quality

3. **Local First** - Default Ollama với bge-m3:567m (free, private, high quality)

4. **Multi-Provider Flexibility** - Dễ dàng switch giữa Ollama, OpenAI, Google

5. **Batch Optimization** - Throughput cao với batch processing và concurrent execution

6. **Graceful Degradation** - Continue khi một số vectors fail, chỉ fail job khi <95% success

7. **Production Ready** - Error handling toàn diện, retry logic, monitoring

### Điểm nổi bật:

✅ **Multi-Vector Retrieval** (child chunks + summaries + questions)
✅ **Hybrid Search** (dense + sparse embeddings - REQUIRED)
✅ **Default: Ollama với bge-m3:567m** (local, free, 1024-dim)
✅ **Multi-provider support** (OpenAI, Google)
✅ **BM25 sparse embeddings** (algorithmic, fast, no model required)
✅ **Batch processing** (32 chunks per batch, 3 concurrent)
✅ **Retry logic** (exponential backoff, 3 attempts)
✅ **Graceful error handling** (≥95% success rate required)
✅ **Performance optimized** (>500 chunks/min throughput)
✅ **Progress tracking** (% completion logged)
✅ **Vocabulary management** (BM25 IDF tracking)

### Retrieval Quality:

- **10-20% improvement** với multi-vector retrieval
- **15-30% improvement** với hybrid search (dense + sparse)
- **Total: 25-50% improvement** over baseline (single dense vector)

---

**Trạng thái tài liệu:** Nháp v2.0
**Xem xét tiếp theo:** 2025-11-10
**Lịch sử phiên bản:**

- v2.0 (2025-11-04): Updated với Multi-Vector Retrieval + Hybrid Search (sparse required)
- v1.0 (2025-11-04): Tạo Embed Stage implementation plan ban đầu

---

**Kết thúc tài liệu**
