# LTV Assistant Retrieval Service - Code Standards

## Code Organization Patterns

### Module-Based Architecture

The codebase follows NestJS module conventions with feature-based organization:

```typescript
// Feature module pattern
@Module({
  imports: [ConfigModule, DatabaseModule, ExternalServiceModule],
  providers: [FeatureService, RelatedService],
  controllers: [FeatureController],
  exports: [FeatureService], // Export only what other modules need
})
export class FeatureModule {}
```

### Directory Structure

```
src/
├── domain-feature/              # Feature module (e.g., retrieval/)
│   ├── feature.module.ts       # Module definition
│   ├── feature.controller.ts   # HTTP/TCP controllers
│   ├── services/               # Business logic
│   │   ├── main.service.ts
│   │   └── helper.service.ts
│   ├── workflow/               # LangGraph workflows (if applicable)
│   │   ├── workflow.service.ts
│   │   ├── state/
│   │   └── nodes/
│   ├── providers/              # Factory patterns
│   ├── clients/                # External service clients
│   ├── dto/                    # Data transfer objects
│   └── types/                  # TypeScript type definitions
├── common/                      # Shared utilities
├── database/                    # Database layer
└── shared/                      # Cross-cutting concerns
```

### File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Module | `*.module.ts` | `retrieval.module.ts` |
| Service | `*.service.ts` | `qdrant.service.ts` |
| Controller | `*.controller.ts` | `retrieval-tcp.controller.ts` |
| Guard | `*.guard.ts` | `gateway-auth.guard.ts` |
| Decorator | `*.decorator.ts` | `current-user.decorator.ts` |
| Node (LangGraph) | `*.node.ts` | `analyze-query.node.ts` |
| DTO | `*.dto.ts` | `query-request.dto.ts` |
| Type Definitions | `*.types.ts` or `types/index.ts` | `cache.types.ts` |
| Interface | `*.interface.ts` | `request.interface.ts` |
| Constant | `*.constant.ts` | `roles.constant.ts` |

### Naming Conventions

#### Classes and Interfaces

```typescript
// PascalCase for classes
export class QueryTransformationService {}
export class RetrievalWorkflowService {}

// PascalCase for interfaces
export interface UserContext {
  userId: string;
  email: string;
  role: string;
}

// Use descriptive names
export interface QdrantResult {} // Good
export interface Result {} // Too generic - avoid
```

#### Functions and Variables

```typescript
// camelCase for functions and variables
async function reformulateQuery(query: string): Promise<string[]> {}
const rerankedResults = await rerankerService.rerank(query, results);

// Factory functions for nodes use 'create' prefix
export function createAnalyzeQueryNode(
  embeddingFactory: EmbeddingProviderFactory,
  transformationService: QueryTransformationService,
) {
  return async (state: RetrievalStateType): Promise<Partial<RetrievalStateType>> => {
    // Node implementation
  };
}
```

#### Constants

```typescript
// UPPER_SNAKE_CASE for constants
export const DEFAULT_TOP_K = 10;
export const RERANK_SCORE_THRESHOLD = 0.3;
export const MAX_RETRY_ITERATIONS = 3;

// Enums use PascalCase
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  USER = 'USER',
}
```

## TypeScript Usage Guidelines

### Strict Type Safety

#### Never Use `any`

```typescript
// BAD - Never use 'any'
function processData(data: any): any {
  return data.value;
}

// GOOD - Use specific types
interface DataInput {
  value: string;
  metadata: Record<string, unknown>;
}

function processData(data: DataInput): string {
  return data.value;
}

// GOOD - Use generics for flexibility
function processGeneric<T extends { value: string }>(data: T): string {
  return data.value;
}

// GOOD - Use unknown for truly unknown types, then narrow
function processUnknown(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    const typed = data as { value: string };
    return typed.value;
  }
  throw new Error('Invalid data');
}
```

#### Never Use Type Assertions (`as`)

```typescript
// BAD - Type assertions bypass type checking
const result = response as QdrantResult[];
const user = req.user as UserContext;

// GOOD - Use type guards
function isQdrantResult(value: unknown): value is QdrantResult {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.chunkId === 'string' &&
    typeof obj.score === 'number' &&
    typeof obj.content === 'string'
  );
}

const results = response.filter(isQdrantResult);

// GOOD - Use proper typing from the start
interface TypedResponse {
  results: QdrantResult[];
}

async function queryQdrant(): Promise<TypedResponse> {
  // Type-safe from the start
}
```

#### Prefer Interfaces Over Types

```typescript
// GOOD - Use interfaces for object shapes
export interface Context {
  parentChunkId: string;
  documentId: string;
  content: string;
  tokens: number;
  score: number;
  metadata: Record<string, unknown>;
}

// GOOD - Use type for unions, intersections, and utilities
export type RetrievalMode = 'retrieval_only' | 'generation';
export type Optional<T> = T | null;

// GOOD - Extend interfaces
export interface EnrichedContext extends Context {
  sources: {
    childChunks: ChildChunk[];
  };
}
```

#### Strong Function Signatures

```typescript
// BAD - Weak typing
function search(query, options) {
  // Implementation
}

// GOOD - Strong typing with optional parameters
interface SearchOptions {
  topK?: number;
  useCache?: boolean;
  mode?: RetrievalMode;
}

async function search(
  query: string,
  options: SearchOptions = {},
): Promise<Context[]> {
  const { topK = 10, useCache = true, mode = 'retrieval_only' } = options;
  // Type-safe implementation
}

// GOOD - Return type inference for simple functions
function calculateScore(relevance: number, recency: number): number {
  return relevance * 0.7 + recency * 0.3;
}
```

#### Null Safety

```typescript
// GOOD - Explicit null/undefined handling
interface QueryState {
  query: string;
  queryEmbedding: number[] | null; // Explicit nullable
  rewrittenQuery: string | null;
  errors: string[]; // Non-nullable array
}

// GOOD - Optional chaining and nullish coalescing
const embedding = state.queryEmbedding ?? await generateEmbedding(state.query);
const title = metadata?.documentTitle ?? 'Untitled';

// GOOD - Narrow types before use
function processEmbedding(embedding: number[] | null): void {
  if (embedding === null) {
    throw new Error('Embedding required');
  }
  // Now TypeScript knows embedding is number[]
  const dimension = embedding.length;
}
```

### Generic Types

```typescript
// GOOD - Generic service methods
class CacheService<T> {
  async get(key: string): Promise<T | null> {
    // Implementation
  }

  async set(key: string, value: T, ttl?: number): Promise<void> {
    // Implementation
  }
}

// GOOD - Constrained generics
interface HasId {
  id: string;
}

function findById<T extends HasId>(items: T[], id: string): T | undefined {
  return items.find(item => item.id === id);
}

// GOOD - Generic factory pattern
interface ProviderOptions {
  model: string;
  temperature?: number;
}

class ProviderFactory {
  createProvider<T extends ProviderOptions>(
    type: 'chat' | 'embedding',
    options: T,
  ): ChatModel | EmbeddingModel {
    // Type-safe provider creation
  }
}
```

## Error Handling Patterns

### Service-Level Error Handling

```typescript
@Injectable()
export class QdrantService {
  private readonly logger = new Logger(QdrantService.name);

  async search(query: string, topK: number): Promise<QdrantResult[]> {
    try {
      const embedding = await this.embed(query);
      const response = await this.client.search(embedding, topK);
      return this.mapResults(response);
    } catch (error: unknown) {
      // Always type error as unknown, then narrow
      this.logger.error(
        'Qdrant search failed',
        error instanceof Error ? error.stack : String(error),
      );

      // Rethrow for upstream handling or provide fallback
      if (error instanceof QdrantConnectionError) {
        throw new ServiceUnavailableException('Vector database unavailable');
      }

      throw new InternalServerErrorException('Search failed');
    }
  }
}
```

### Workflow Node Error Handling

```typescript
export function createRerankNode(
  rerankerService: RerankerService,
  configService: ConfigService,
) {
  return async (
    state: RetrievalStateType,
  ): Promise<Partial<RetrievalStateType>> => {
    try {
      const reranked = await rerankerService.rerank(state.query, state.fusedResults);
      return {
        currentStage: 'rerank',
        rerankedResults: reranked,
      };
    } catch (error: unknown) {
      // Graceful degradation - use RRF scores as fallback
      const fallbackResults = state.fusedResults
        .map(result => ({
          ...result,
          rerankScore: result.rrfScore,
        }))
        .sort((a, b) => b.rerankScore - a.rerankScore)
        .slice(0, state.topK);

      return {
        currentStage: 'rerank',
        rerankedResults: fallbackResults,
        errors: [
          ...state.errors,
          `Reranking failed: ${error instanceof Error ? error.message : String(error)} (using RRF fallback)`,
        ],
      };
    }
  };
}
```

### Validation with class-validator

```typescript
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';

export class QueryRequestDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsEnum(['retrieval_only', 'generation'])
  @IsOptional()
  mode?: 'retrieval_only' | 'generation';

  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  topK?: number;

  @IsBoolean()
  @IsOptional()
  useCache?: boolean;
}
```

## Testing Approaches

### Unit Testing Pattern

```typescript
describe('QueryTransformationService', () => {
  let service: QueryTransformationService;
  let mockLLMFactory: jest.Mocked<LLMProviderFactory>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    // Create mocks
    mockLLMFactory = {
      createChatModel: jest.fn(),
    } as unknown as jest.Mocked<LLMProviderFactory>;

    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    // Create service instance
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryTransformationService,
        { provide: LLMProviderFactory, useValue: mockLLMFactory },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<QueryTransformationService>(QueryTransformationService);
  });

  describe('reformulateQuery', () => {
    it('should generate 3-5 query variations', async () => {
      // Arrange
      const query = 'How to implement RAG?';
      const mockChat = {
        invoke: jest.fn().mockResolvedValue({
          content: 'RAG implementation\nRetrieval augmented generation',
        }),
      };
      mockLLMFactory.createChatModel.mockReturnValue(mockChat);

      // Act
      const variations = await service.reformulateQuery(query);

      // Assert
      expect(variations).toBeInstanceOf(Array);
      expect(variations.length).toBeGreaterThanOrEqual(2);
      expect(variations.length).toBeLessThanOrEqual(5);
      expect(mockLLMFactory.createChatModel).toHaveBeenCalledWith(
        'ollama',
        expect.objectContaining({ temperature: 0.7 }),
      );
    });

    it('should return empty array on failure', async () => {
      // Arrange
      mockLLMFactory.createChatModel.mockImplementation(() => {
        throw new Error('Provider unavailable');
      });

      // Act
      const variations = await service.reformulateQuery('test');

      // Assert
      expect(variations).toEqual([]);
    });
  });
});
```

### Integration Testing

```typescript
describe('RetrievalWorkflowService (Integration)', () => {
  let app: INestApplication;
  let workflowService: RetrievalWorkflowService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule], // Full application
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    workflowService = moduleFixture.get<RetrievalWorkflowService>(
      RetrievalWorkflowService,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('should execute full retrieval workflow', async () => {
    // Arrange
    const request = {
      query: 'What is LangChain?',
      mode: 'retrieval_only' as const,
      topK: 5,
    };
    const userContext = {
      userId: 'test-user',
      email: 'test@example.com',
      role: 'USER' as const,
    };

    // Act
    const result = await workflowService.executeWorkflow(request, userContext);

    // Assert
    expect(result.contexts).toBeDefined();
    expect(result.metrics.totalDuration).toBeGreaterThan(0);
    expect(result.cached).toBeDefined();
  });
});
```

### Mocking External Services

```typescript
// Mock Qdrant client
jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue({
      points: [
        { id: '1', score: 0.95, payload: { content: 'test' } },
      ],
    }),
    getCollections: jest.fn().mockResolvedValue({
      collections: [{ name: 'test' }],
    }),
  })),
}));

// Mock axios for TEI client
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
mockedAxios.post.mockResolvedValue({
  data: [{ score: 0.85 }],
});
```

## Documentation Standards

### JSDoc Comments

```typescript
/**
 * Rerank Node
 * Cross-encoder reranking using BGE-Reranker via TEI
 * Based on PRD Section "Reranking Node" (Lines 387-440)
 *
 * This node:
 * 1. Takes fused results from fusion node
 * 2. Calls RerankerService to rerank with cross-encoder
 * 3. Filters by threshold (RERANK_THRESHOLD env var)
 * 4. Falls back to RRF scores if reranker fails
 * 5. Returns top-K reranked results
 *
 * @param rerankerService - Reranker service instance
 * @param configService - Config service for threshold
 * @returns Node function for LangGraph
 */
export function createRerankNode(
  rerankerService: RerankerService,
  configService: ConfigService,
) {
  // Implementation
}

/**
 * Execute the retrieval workflow
 * Based on PRD Section: Thực thi Workflow
 *
 * Workflow stages:
 * 1. Check semantic cache (Phase 1.5)
 * 2. Analyze and transform query (Phase 4)
 * 3. Build access control filter (Phase 5)
 * 4. Execute multi-source retrieval (Phase 5)
 * 5. Fuse results with RRF (Phase 5)
 * 6. Rerank with cross-encoder (Phase 6)
 * 7. Enrich with parent chunks (Phase 6)
 * 8. Check sufficiency and retry if needed (Phase 6)
 * 9. Update cache (Phase 1.5)
 *
 * @param request - Query request from user
 * @param userContext - User context from authentication
 * @returns Retrieval execution result with contexts and metrics
 * @throws {Error} If workflow fails or services unavailable
 */
async executeWorkflow(
  request: QueryRequest,
  userContext: UserContext,
): Promise<RetrievalResult> {
  // Implementation
}
```

### Inline Comments

```typescript
// GOOD - Explain WHY, not WHAT
// Fallback: If all results filtered by threshold, return top N anyway
if (filteredResults.length === 0 && rerankedResults.length > 0) {
  const fallbackCount = configService.get('RERANK_FALLBACK_COUNT', 3);
  topKResults = rerankedResults.slice(0, fallbackCount);
  fallbackTriggered = true;
}

// GOOD - Mark TODOs with context
// TODO: Implement GPU acceleration for reranking (requires CUDA setup)
// TODO: Add support for multi-lingual reranking models

// AVOID - Obvious comments
// Set the variable to true
enabled = true;

// AVOID - Commented-out code (use git history instead)
// const oldMethod = () => { ... }
```

### Type Documentation

```typescript
/**
 * Retrieval State Graph Definition
 * Following LangGraph.js Annotation.Root pattern
 *
 * State fields are organized by workflow stage:
 * - Input: query, mode, topK, user context
 * - Pre-retrieval: embeddings, transformations, access filters
 * - Retrieval: multi-source results (Qdrant, MySQL)
 * - Post-retrieval: fused, reranked, enriched results
 * - Output: final contexts
 * - Control: iterations, sufficiency, retry flags
 * - Metadata: stage, errors, metrics
 */
export const RetrievalState = Annotation.Root({
  // Input fields
  query: Annotation<string>,
  mode: Annotation<'retrieval_only' | 'generation'>,
  // ... more fields
});
```

## Dependency Injection Best Practices

### Constructor Injection

```typescript
@Injectable()
export class RetrievalWorkflowService {
  private readonly logger = new Logger(RetrievalWorkflowService.name);

  constructor(
    // Inject all dependencies in constructor
    private readonly configService: ConfigService,
    private readonly embeddingFactory: EmbeddingProviderFactory,
    private readonly llmFactory: LLMProviderFactory,
    private readonly queryTransformationService: QueryTransformationService,
    private readonly qdrantService: QdrantService,
    private readonly mysqlService: MySQLService,
    // ... more dependencies
  ) {
    // Initialize after all dependencies injected
    this.initializeWorkflow();
  }
}
```

### Provider Configuration

```typescript
@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [
    // Simple provider
    QdrantService,

    // Factory provider
    {
      provide: 'QDRANT_CLIENT',
      useFactory: (config: ConfigService) => {
        return new QdrantClient({
          url: config.get('QDRANT_URL'),
          apiKey: config.get('QDRANT_API_KEY'),
        });
      },
      inject: [ConfigService],
    },

    // Value provider (constants)
    {
      provide: 'DEFAULT_TOP_K',
      useValue: 10,
    },
  ],
  exports: [QdrantService],
})
export class QdrantModule {}
```

## Configuration Management

### Environment Variables

```typescript
// GOOD - Type-safe config access with defaults
const topK = this.configService.get<number>('TOP_K_DEFAULT', 10);
const threshold = this.configService.get<number>('RERANK_SCORE_THRESHOLD', 0.0);
const enabled = this.configService.get<boolean>('CACHE_ENABLED', true);

// GOOD - Validate required config
const qdrantUrl = this.configService.getOrThrow<string>('QDRANT_URL');

// GOOD - Organize config by feature
const cacheConfig = {
  ttl: this.configService.get<number>('CACHE_TTL', 3600),
  threshold: this.configService.get<number>('CACHE_SIMILARITY_THRESHOLD', 0.95),
  enabled: this.configService.get<boolean>('CACHE_ENABLED', true),
};
```

## Async/Await Patterns

```typescript
// GOOD - Proper async/await usage
async function processQuery(query: string): Promise<Context[]> {
  const embedding = await embedQuery(query);
  const results = await searchVectors(embedding);
  const reranked = await rerankResults(query, results);
  return reranked;
}

// GOOD - Parallel execution
async function multiSourceRetrieval(query: string): Promise<AllResults> {
  const [qdrantResults, mysqlResults] = await Promise.all([
    qdrantService.search(query),
    mysqlService.search(query),
  ]);

  return { qdrantResults, mysqlResults };
}

// GOOD - Error handling in async
async function safeFetch(url: string): Promise<Response | null> {
  try {
    return await fetch(url);
  } catch (error: unknown) {
    logger.error('Fetch failed', error);
    return null;
  }
}

// AVOID - Unhandled promise rejections
void someAsyncFunction(); // BAD

// GOOD - Handle explicitly
void (async () => {
  try {
    await someAsyncFunction();
  } catch (error: unknown) {
    logger.error('Failed', error);
  }
})();
```

## Logging Standards

```typescript
import { Logger } from '@nestjs/common';

@Injectable()
export class MyService {
  private readonly logger = new Logger(MyService.name);

  async process(data: Data): Promise<Result> {
    // Log method entry with key params
    this.logger.log(`Processing data: ${data.id}`);

    try {
      const result = await this.doWork(data);

      // Log success with metrics
      this.logger.log(`Processing completed: ${data.id} (${result.duration}ms)`);

      return result;
    } catch (error: unknown) {
      // Log errors with stack trace
      this.logger.error(
        `Processing failed: ${data.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  // Log warnings for degraded but functional states
  async fetchWithFallback(url: string): Promise<Data> {
    try {
      return await this.fetchPrimary(url);
    } catch (error: unknown) {
      this.logger.warn(
        `Primary fetch failed, using fallback: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.fetchFallback(url);
    }
  }

  // Debug logs for development
  private debugState(state: State): void {
    this.logger.debug(`State: ${JSON.stringify(state, null, 2)}`);
  }
}
```

## Performance Considerations

### Batch Processing

```typescript
// GOOD - Batch embeddings
async function embedBatch(texts: string[]): Promise<number[][]> {
  const batchSize = 24; // Configurable
  const batches = chunk(texts, batchSize);

  const results = await Promise.all(
    batches.map(batch => embedder.embedDocuments(batch)),
  );

  return results.flat();
}

// GOOD - Connection pooling
const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  pool: {
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000,
  },
};
```

### Caching Strategy

```typescript
// GOOD - Multi-layer caching
async function getCachedData(key: string): Promise<Data | null> {
  // L1: Memory cache (fastest)
  const memCached = this.memoryCache.get(key);
  if (memCached) return memCached;

  // L2: Redis cache (fast)
  const redisCached = await this.redisCache.get(key);
  if (redisCached) {
    this.memoryCache.set(key, redisCached);
    return redisCached;
  }

  // L3: Semantic cache (slower but smarter)
  const semanticCached = await this.semanticCache.search(key);
  if (semanticCached) {
    this.redisCache.set(key, semanticCached);
    this.memoryCache.set(key, semanticCached);
    return semanticCached;
  }

  return null;
}
```

## Code Review Checklist

- [ ] No use of `any` or `as` type assertions
- [ ] All functions have explicit return types
- [ ] Errors typed as `unknown`, then narrowed
- [ ] Nullable types explicit (`| null` or `| undefined`)
- [ ] Input validation with class-validator
- [ ] Comprehensive error handling with fallbacks
- [ ] Structured logging with context
- [ ] JSDoc comments for public APIs
- [ ] Unit tests for business logic
- [ ] Integration tests for workflows
- [ ] No hardcoded configuration (use env vars)
- [ ] Dependency injection used correctly
- [ ] Async/await used properly (no floating promises)
- [ ] Performance optimizations (batching, caching)
- [ ] Security considerations (input sanitization, RBAC)
