# Kế hoạch Triển khai Memory/Checkpoint cho Retrieval-Only Mode qua MCP Server

**Phiên bản:** 1.0
**Ngày tạo:** 2025-11-14
**Trạng thái:** Kế hoạch Chi tiết
**Liên quan:**
- [project-overview-pdr.md](../project-overview-pdr.md)
- [retrieval-prd.md](./retrieval-prd.md)
- [retrieval-implement-plan.md](./retrieval-implement-plan.md)
- [semantic-cache-design.md](../semantic-cache-design.md)
- [mcp-server-implement-plan.md](./mcp-server-implement-plan.md)

---

## Mục lục

1. [Tổng quan](#tổng-quan)
2. [Phân tích Conversation ID từ VS Code](#phân-tích-conversation-id-từ-vs-code)
3. [Kiến trúc Memory trong LangGraph](#kiến-trúc-memory-trong-langgraph)
4. [Thiết kế Hệ thống Checkpoint](#thiết-kế-hệ-thống-checkpoint)
5. [Luồng Triển khai Chi tiết](#luồng-triển-khai-chi-tiết)
6. [Schema & Data Models](#schema--data-models)
7. [Tích hợp với MCP Server](#tích-hợp-với-mcp-server)
8. [Tích hợp với Retrieval Service](#tích-hợp-với-retrieval-service)
9. [Tính năng Nâng cao](#tính-năng-nâng-cao)
10. [Testing Strategy](#testing-strategy)
11. [Giám sát & Metrics](#giám-sát--metrics)
12. [Timeline & Milestones](#timeline--milestones)

---

## Tổng quan

### Mục tiêu

Xây dựng **conversation memory** cho LTV Assistant MCP Server để:

1. ✅ **Theo dõi ngữ cảnh cuộc trội** - Lưu trữ lịch sử truy vấn và kết quả trong mỗi conversation
2. ✅ **Cải thiện độ chính xác** - Sử dụng conversation history để làm phong phú query
3. ✅ **Tối ưu hiệu suất** - Tránh truy vấn trùng lặp bằng checkpoint cache
4. ✅ **Hỗ trợ multi-turn conversations** - Cho phép follow-up questions có ngữ cảnh
5. ✅ **Tuân thủ RBAC** - Memory được scope theo user permissions

### Phạm vi Phase 1

**Tập trung vào retrieval_only mode:**
- Lưu trữ query history và retrieved contexts per conversation
- Sử dụng LangGraph checkpointer với MySQL backend
- Tích hợp `vscode.conversationId` làm `thread_id`
- Không implement generation mode (để cho phase sau)

### Key Principles

1. **Conversation-Scoped** - Mỗi conversation (thread) là một unit cô lập
2. **User-Aware** - Memory được phân quyền theo user/datasource access
3. **Performance-First** - Checkpoint storage không được làm chậm retrieval
4. **Backward Compatible** - Không phá vỡ existing MCP clients
5. **Privacy-Safe** - Sensitive data được mask/redact trong logs

---

## Phân tích Conversation ID từ VS Code

### Request Metadata từ VS Code Copilot Chat

Khi VS Code Copilot Chat gọi MCP server, nó gửi metadata trong `extra._meta`:

```typescript
{
  signal: AbortSignal { aborted: false },
  sessionId: undefined,  // STDIO transport không có session ID
  _meta: {
    progressToken: '236b9c2e-c802-4b2e-96d9-d6f9a97bc75d',
    'vscode.conversationId': 'ba971ddd-9344-437e-b846-3ea1de5cbcd8',  // ← KEY!
    'vscode.requestId': 'f8970589-c63e-47c7-8f30-46385c2f6829'
  },
  requestId: 5,
  authInfo: undefined,
  requestInfo: undefined
}
```

### Vai trò của các IDs

| Field | Scope | Persistence | Use Case |
|-------|-------|-------------|----------|
| `vscode.conversationId` | **Toàn bộ conversation** | Persistent across requests | **Thread ID** cho checkpoint |
| `vscode.requestId` | Single request | One-time | Request tracking, logging |
| `progressToken` | Single request | One-time | Progress notifications |
| `requestId` (JSON-RPC) | Single request | One-time | JSON-RPC correlation |

**🎯 Kết luận:**
`vscode.conversationId` là **perfect candidate** để làm LangGraph `thread_id`!

---

## Kiến trúc Memory trong LangGraph

### Short-term Memory (Thread-scoped)

Theo tài liệu LangChain, có 2 loại memory:

#### 1. **Short-term Memory (Checkpointer)**
- **Scope:** Trong một thread/conversation
- **Storage:** Thread-scoped checkpoints
- **Use case:** Conversation history, intermediate states
- **Implementation:** `BaseCheckpointSaver`

#### 2. **Long-term Memory (Store)**
- **Scope:** Cross-thread, cross-user
- **Storage:** Namespace-based store
- **Use case:** User profiles, preferences, facts
- **Implementation:** `BaseStore`

### Phase 1 Focus: Short-term Memory Only

Chúng ta sẽ implement **Short-term memory** với:
- **Checkpointer:** MySQL-based checkpoint storage
- **Thread ID:** `vscode.conversationId`
- **State:** Query history + retrieved contexts
- **Scope:** Per-conversation isolation

Long-term memory (Store) để cho phase sau.

---

## Thiết kế Hệ thống Checkpoint

### Lựa chọn Checkpointer Backend

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **InMemorySaver** | Fast, simple | Lost on restart | ❌ Dev only |
| **SqliteSaver** | File-based, portable | Single-node only | ❌ Not scalable |
| **PostgresSaver** | Production-ready, scalable | New dependency | ⚠️ Overkill |
| **MySQL (Custom)** | Reuse existing DB | Need implement | ✅ **CHOSEN** |

**Quyết định:** Implement **custom MySQL checkpointer** vì:
- Tái sử dụng MySQL infrastructure hiện có
- Consistency với metadata storage
- Không thêm dependency mới
- Có thể tận dụng Drizzle ORM

### Database Schema

#### Table: `conversation_checkpoints`

```sql
CREATE TABLE conversation_checkpoints (
  -- Primary identification
  thread_id VARCHAR(255) NOT NULL,           -- vscode.conversationId
  checkpoint_id VARCHAR(255) NOT NULL,       -- UUID cho mỗi checkpoint

  -- Checkpoint metadata
  checkpoint_ns VARCHAR(255) DEFAULT '',     -- Namespace (empty for root graph)
  parent_checkpoint_id VARCHAR(255),         -- Liên kết checkpoint trước đó

  -- State storage
  checkpoint_blob MEDIUMTEXT NOT NULL,       -- JSON-serialized graph state
  metadata_blob TEXT,                        -- Additional metadata

  -- Timestamps & tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Indexes
  PRIMARY KEY (thread_id, checkpoint_id),
  INDEX idx_thread_created (thread_id, created_at DESC),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table: `conversation_metadata`

```sql
CREATE TABLE conversation_metadata (
  -- Conversation tracking
  thread_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),                      -- From auth token

  -- Conversation context
  first_query TEXT,                          -- First user query
  query_count INT DEFAULT 0,                 -- Total queries in conversation
  context_count INT DEFAULT 0,               -- Total contexts retrieved

  -- RBAC tracking
  datasource_ids JSON,                       -- List of accessed datasource IDs
  access_level ENUM('public', 'private', 'mixed') DEFAULT 'public',

  -- Timestamps
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expired_at TIMESTAMP NULL,                 -- For TTL cleanup

  -- Indexes
  INDEX idx_user_id (user_id),
  INDEX idx_last_activity (last_activity_at),
  INDEX idx_expired_at (expired_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## Luồng Triển khai Chi tiết

### Phase 1.1: MySQL Checkpointer Implementation (Week 1)

#### Step 1: Create Checkpointer Service

**File:** `ltv-assistant-retrieval/src/retrieval/services/mysql-checkpointer.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { BaseCheckpointSaver, Checkpoint, CheckpointMetadata } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';

@Injectable()
export class MySqlCheckpointerService extends BaseCheckpointSaver {
  constructor(
    private readonly mysqlService: MySqlService,
  ) {
    super();
  }

  /**
   * Get checkpoint by thread_id and checkpoint_id
   */
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id;
    const checkpointId = config.configurable?.checkpoint_id;

    if (!threadId) return undefined;

    // Query from MySQL
    const checkpoint = await this.mysqlService.getCheckpoint(
      threadId,
      checkpointId || 'latest'
    );

    if (!checkpoint) return undefined;

    return {
      config,
      checkpoint: JSON.parse(checkpoint.checkpoint_blob),
      metadata: checkpoint.metadata_blob ? JSON.parse(checkpoint.metadata_blob) : {},
      parentConfig: checkpoint.parent_checkpoint_id
        ? { configurable: { thread_id: threadId, checkpoint_id: checkpoint.parent_checkpoint_id } }
        : undefined,
    };
  }

  /**
   * Save checkpoint to MySQL
   */
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      throw new Error('thread_id is required in config.configurable');
    }

    const checkpointId = checkpoint.id || generateUUID();
    const parentCheckpointId = metadata.source === 'update'
      ? config.configurable?.checkpoint_id
      : undefined;

    await this.mysqlService.saveCheckpoint({
      thread_id: threadId,
      checkpoint_id: checkpointId,
      checkpoint_ns: config.configurable?.checkpoint_ns || '',
      parent_checkpoint_id: parentCheckpointId,
      checkpoint_blob: JSON.stringify(checkpoint),
      metadata_blob: JSON.stringify(metadata),
    });

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_id: checkpointId,
        checkpoint_ns: config.configurable?.checkpoint_ns || '',
      },
    };
  }

  /**
   * List checkpoints for a thread
   */
  async *list(
    config: RunnableConfig,
    options?: { limit?: number; before?: RunnableConfig },
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) return;

    const checkpoints = await this.mysqlService.listCheckpoints(
      threadId,
      options?.limit || 10,
      options?.before?.configurable?.checkpoint_id,
    );

    for (const cp of checkpoints) {
      yield {
        config: { configurable: { thread_id: threadId, checkpoint_id: cp.checkpoint_id } },
        checkpoint: JSON.parse(cp.checkpoint_blob),
        metadata: cp.metadata_blob ? JSON.parse(cp.metadata_blob) : {},
        parentConfig: cp.parent_checkpoint_id
          ? { configurable: { thread_id: threadId, checkpoint_id: cp.parent_checkpoint_id } }
          : undefined,
      };
    }
  }
}
```

#### Step 2: Define Graph State Schema

**File:** `ltv-assistant-retrieval/src/retrieval/types/conversation-state.types.ts`

```typescript
import { MessagesAnnotation } from '@langchain/langgraph';
import { z } from 'zod';

/**
 * Conversation state for retrieval-only mode
 */
export const ConversationStateSchema = z.object({
  // Query tracking
  queries: z.array(z.object({
    query: z.string(),
    timestamp: z.string(),
    topK: z.number(),
  })).default([]),

  // Retrieved contexts history
  retrievedContexts: z.array(z.object({
    parentChunkId: z.string(),
    documentId: z.string(),
    content: z.string(),
    score: z.number(),
    timestamp: z.string(),
    queryIndex: z.number(),  // Link to queries array
  })).default([]),

  // Current request
  currentQuery: z.string().optional(),
  currentTopK: z.number().optional(),

  // Metadata
  conversationId: z.string().optional(),
  userId: z.string().optional(),
  datasourceIds: z.array(z.string()).default([]),

  // Retrieval results (current turn)
  contexts: z.array(z.any()).default([]),
  metrics: z.record(z.any()).optional(),
  cached: z.boolean().default(false),
});

export type ConversationState = z.infer<typeof ConversationStateSchema>;
```

#### Step 3: Update Retrieval Workflow với Checkpointer

**File:** `ltv-assistant-retrieval/src/retrieval/workflows/retrieval.workflow.ts`

```typescript
import { StateGraph, START, END } from '@langchain/langgraph';
import { ConversationState } from '../types/conversation-state.types';

export class RetrievalWorkflowService {
  constructor(
    private readonly checkpointer: MySqlCheckpointerService,
    // ... other services
  ) {}

  createRetrievalGraph() {
    const workflow = new StateGraph<ConversationState>({
      channels: {
        queries: { value: (x, y) => x.concat(y), default: () => [] },
        retrievedContexts: { value: (x, y) => x.concat(y), default: () => [] },
        currentQuery: { value: (x, y) => y ?? x, default: () => undefined },
        currentTopK: { value: (x, y) => y ?? x, default: () => 10 },
        conversationId: { value: (x, y) => y ?? x, default: () => undefined },
        userId: { value: (x, y) => y ?? x, default: () => undefined },
        datasourceIds: { value: (x, y) => Array.from(new Set([...x, ...y])), default: () => [] },
        contexts: { value: (x, y) => y, default: () => [] },
        metrics: { value: (x, y) => ({ ...x, ...y }), default: () => ({}) },
        cached: { value: (x, y) => y, default: () => false },
      },
    });

    // Add nodes
    workflow.addNode('loadHistory', this.loadConversationHistory.bind(this));
    workflow.addNode('enrichQuery', this.enrichQueryWithHistory.bind(this));
    workflow.addNode('checkCache', this.checkCacheNode.bind(this));
    workflow.addNode('analyzeQuery', this.analyzeQueryNode.bind(this));
    workflow.addNode('buildAccessFilter', this.buildAccessFilterNode.bind(this));
    workflow.addNode('hybridRetrieval', this.hybridRetrievalNode.bind(this));
    workflow.addNode('fusion', this.fusionNode.bind(this));
    workflow.addNode('rerank', this.rerankNode.bind(this));
    workflow.addNode('enrich', this.enrichNode.bind(this));
    workflow.addNode('saveHistory', this.saveConversationHistory.bind(this));
    workflow.addNode('updateCache', this.updateCacheNode.bind(this));

    // Define edges
    workflow.addEdge(START, 'loadHistory');
    workflow.addEdge('loadHistory', 'enrichQuery');
    workflow.addEdge('enrichQuery', 'checkCache');
    workflow.addConditionalEdges('checkCache', this.routeCache.bind(this), {
      hit: 'saveHistory',
      miss: 'analyzeQuery',
    });
    workflow.addEdge('analyzeQuery', 'buildAccessFilter');
    workflow.addEdge('buildAccessFilter', 'hybridRetrieval');
    workflow.addEdge('hybridRetrieval', 'fusion');
    workflow.addEdge('fusion', 'rerank');
    workflow.addEdge('rerank', 'enrich');
    workflow.addEdge('enrich', 'saveHistory');
    workflow.addEdge('saveHistory', 'updateCache');
    workflow.addEdge('updateCache', END);

    // Compile with checkpointer
    return workflow.compile({
      checkpointer: this.checkpointer,
    });
  }

  /**
   * Load conversation history from checkpoint
   */
  private async loadConversationHistory(
    state: ConversationState,
  ): Promise<Partial<ConversationState>> {
    // History được load tự động bởi checkpointer
    // Node này chỉ log thông tin
    this.logger.log(`Loaded ${state.queries.length} previous queries from conversation ${state.conversationId}`);

    return {}; // No state changes needed
  }

  /**
   * Enrich current query with conversation context
   */
  private async enrichQueryWithHistory(
    state: ConversationState,
  ): Promise<Partial<ConversationState>> {
    const { currentQuery, queries, retrievedContexts } = state;

    if (!currentQuery || queries.length === 0) {
      return {}; // No enrichment needed for first query
    }

    // Lấy 3 queries gần nhất
    const recentQueries = queries.slice(-3);

    // Lấy top contexts từ lần query trước
    const lastQueryIndex = queries.length - 1;
    const recentContexts = retrievedContexts
      .filter(ctx => ctx.queryIndex === lastQueryIndex)
      .slice(0, 3);

    // Build enriched query với context
    const contextSummary = recentContexts
      .map(ctx => `- ${ctx.content.substring(0, 200)}...`)
      .join('\n');

    const enrichedQuery = `
Previous queries in this conversation:
${recentQueries.map(q => `- ${q.query}`).join('\n')}

Recent retrieved context:
${contextSummary}

Current query: ${currentQuery}
    `.trim();

    this.logger.debug(`Enriched query with ${recentQueries.length} previous queries and ${recentContexts.length} contexts`);

    // Lưu enriched query vào state để các node sau dùng
    return {
      currentQuery: enrichedQuery,
    };
  }

  /**
   * Save current retrieval to history
   */
  private async saveConversationHistory(
    state: ConversationState,
  ): Promise<Partial<ConversationState>> {
    const { currentQuery, currentTopK, contexts, queries } = state;

    if (!currentQuery) {
      return {};
    }

    const queryIndex = queries.length;
    const newQuery = {
      query: currentQuery,
      timestamp: new Date().toISOString(),
      topK: currentTopK || 10,
    };

    const newContexts = contexts.map(ctx => ({
      parentChunkId: ctx.parentChunkId,
      documentId: ctx.documentId,
      content: ctx.content,
      score: ctx.score,
      timestamp: new Date().toISOString(),
      queryIndex,
    }));

    return {
      queries: [newQuery],  // Will be concatenated by channel reducer
      retrievedContexts: newContexts,
    };
  }
}
```

---

### Phase 1.2: MCP Server Integration (Week 1-2)

#### Update MCP Server Tool Handler

**File:** `ltv-assistant-mcp/src/server.ts`

```typescript
server.registerTool(
  'retrieve',
  {
    description: '...',
    inputSchema: {
      query: z.string().describe('The search query...'),
      topK: z.number().min(1).max(50).optional().default(10),
    },
  },
  async (args, extra) => {
    try {
      // Extract conversation context
      const conversationId = extra._meta?.['vscode.conversationId'] as string;
      const requestId = extra.requestId;
      const userId = extra.authInfo?.userId || 'anonymous';

      // Log session information
      console.error(
        `[ConversationID: ${conversationId}] [RequestID: ${requestId}] Query: "${args.query}"`
      );

      // Call retrieval service với conversation context
      const result = await queryRetrieval(
        args.query,
        args.topK || 10,
        config.apiGatewayUrl,
        config.authToken,
        {
          conversationId,  // ← Pass as thread_id
          requestId: String(requestId),
          userId,
        }
      );

      // Return result with conversation metadata
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            query: args.query,
            contexts: result.contexts,
            metrics: {
              ...result.metrics,
              conversationId,
              requestId,
              queryCount: result.queryCount,  // From checkpoint state
            },
            cached: result.cached,
          }, null, 2),
        }],
      };
    } catch (error) {
      // Error handling...
    }
  }
);
```

#### Update API Gateway to Pass Conversation Context

**File:** `api-gateway/src/retrieval/retrieval.controller.ts`

```typescript
@Post('query')
async query(
  @Body() dto: QueryDto,
  @Headers('authorization') auth: string,
  @Headers('x-conversation-id') conversationId?: string,
  @Headers('x-request-id') requestId?: string,
) {
  // Validate auth token
  const userId = await this.authService.validateToken(auth);

  // Call retrieval service với conversation context
  const result = await this.retrievalService.query({
    query: dto.query,
    mode: dto.mode,
    topK: dto.topK,
    userId,
    conversationId,
    requestId,
  });

  return result;
}
```

---

### Phase 1.3: Database Migrations (Week 2)

#### Create Migration Files

**File:** `ltv-assistant-retrieval/drizzle/migrations/0005_conversation_checkpoints.sql`

```sql
-- Create conversation_checkpoints table
CREATE TABLE IF NOT EXISTS conversation_checkpoints (
  thread_id VARCHAR(255) NOT NULL,
  checkpoint_id VARCHAR(255) NOT NULL,
  checkpoint_ns VARCHAR(255) DEFAULT '',
  parent_checkpoint_id VARCHAR(255),
  checkpoint_blob MEDIUMTEXT NOT NULL,
  metadata_blob TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id, checkpoint_id),
  INDEX idx_thread_created (thread_id, created_at DESC),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create conversation_metadata table
CREATE TABLE IF NOT EXISTS conversation_metadata (
  thread_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  first_query TEXT,
  query_count INT DEFAULT 0,
  context_count INT DEFAULT 0,
  datasource_ids JSON,
  access_level ENUM('public', 'private', 'mixed') DEFAULT 'public',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expired_at TIMESTAMP NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_last_activity (last_activity_at),
  INDEX idx_expired_at (expired_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## Tính năng Nâng cao

### 1. Conversation TTL & Cleanup

**Tự động xóa conversations cũ:**

```typescript
@Cron('0 0 * * *')  // Daily at midnight
async cleanupExpiredConversations() {
  const retentionDays = 30;
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - retentionDays);

  // Mark expired conversations
  await this.mysqlService.query(`
    UPDATE conversation_metadata
    SET expired_at = NOW()
    WHERE last_activity_at < ?
      AND expired_at IS NULL
  `, [expiredDate]);

  // Delete old checkpoints (after 7 days grace period)
  const deleteDate = new Date();
  deleteDate.setDate(deleteDate.getDate() - 37);

  await this.mysqlService.query(`
    DELETE cp FROM conversation_checkpoints cp
    INNER JOIN conversation_metadata cm ON cp.thread_id = cm.thread_id
    WHERE cm.expired_at < ?
  `, [deleteDate]);

  this.logger.log(`Cleaned up conversations older than ${retentionDays} days`);
}
```

### 2. Conversation Analytics

**Track conversation metrics:**

```typescript
interface ConversationStats {
  thread_id: string;
  query_count: number;
  avg_contexts_per_query: number;
  unique_documents: number;
  duration_minutes: number;
  cache_hit_rate: number;
}

async getConversationStats(threadId: string): Promise<ConversationStats> {
  const metadata = await this.getConversationMetadata(threadId);
  const checkpoints = await this.listCheckpoints(threadId);

  // Calculate stats from checkpoints
  return {
    thread_id: threadId,
    query_count: metadata.query_count,
    avg_contexts_per_query: metadata.context_count / metadata.query_count,
    unique_documents: this.countUniqueDocuments(checkpoints),
    duration_minutes: this.calculateDuration(metadata),
    cache_hit_rate: this.calculateCacheHitRate(checkpoints),
  };
}
```

### 3. Query Rewriting with History

**Sử dụng conversation history để cải thiện query:**

```typescript
async rewriteQueryWithHistory(
  currentQuery: string,
  conversationHistory: ConversationState,
): Promise<string> {
  const recentQueries = conversationHistory.queries.slice(-3);
  const recentContexts = conversationHistory.retrievedContexts
    .filter(ctx => ctx.queryIndex === conversationHistory.queries.length - 1)
    .slice(0, 3);

  const prompt = `
Given the conversation history and current query, rewrite the query to be more specific and contextual.

Previous queries:
${recentQueries.map(q => `- ${q.query}`).join('\n')}

Recent context:
${recentContexts.map(ctx => `- ${ctx.content.substring(0, 150)}...`).join('\n')}

Current query: ${currentQuery}

Rewritten query:`;

  const rewritten = await this.llmService.complete(prompt);

  return rewritten.trim();
}
```

---

## Testing Strategy

### Unit Tests

**File:** `ltv-assistant-retrieval/src/retrieval/services/mysql-checkpointer.service.spec.ts`

```typescript
describe('MySqlCheckpointerService', () => {
  it('should save and retrieve checkpoint', async () => {
    const threadId = 'test-conversation-123';
    const checkpoint = { /* ... */ };

    await checkpointer.put({ configurable: { thread_id: threadId } }, checkpoint, {});

    const retrieved = await checkpointer.getTuple({ configurable: { thread_id: threadId } });

    expect(retrieved.checkpoint).toEqual(checkpoint);
  });

  it('should list checkpoints in order', async () => {
    // Create multiple checkpoints
    // Verify ordering
  });
});
```

### Integration Tests

**File:** `ltv-assistant-retrieval/test/e2e/conversation-memory.e2e-spec.ts`

```typescript
describe('Conversation Memory (E2E)', () => {
  it('should maintain context across multiple queries', async () => {
    const conversationId = generateUUID();

    // First query
    const result1 = await request(app.getHttpServer())
      .post('/retrieval/query')
      .set('x-conversation-id', conversationId)
      .send({ query: 'What is RAG?', mode: 'retrieval_only' });

    expect(result1.body.metrics.queryCount).toBe(1);

    // Second query (follow-up)
    const result2 = await request(app.getHttpServer())
      .post('/retrieval/query')
      .set('x-conversation-id', conversationId)
      .send({ query: 'How does it work?', mode: 'retrieval_only' });

    expect(result2.body.metrics.queryCount).toBe(2);
    // Verify enriched query used conversation history
  });
});
```

---

## Giám sát & Metrics

### Prometheus Metrics

```typescript
// Conversation metrics
conversation_total_active gauge
conversation_queries_per_conversation histogram
conversation_duration_seconds histogram
conversation_checkpoint_size_bytes histogram

// Checkpointer performance
checkpoint_save_duration_seconds histogram
checkpoint_load_duration_seconds histogram
checkpoint_list_duration_seconds histogram

// Memory usage
conversation_state_size_bytes histogram
checkpoint_storage_total_bytes gauge
```

### Grafana Dashboard Panels

**Panel 1: Active Conversations**
```promql
conversation_total_active
```

**Panel 2: Average Queries per Conversation**
```promql
avg(conversation_queries_per_conversation)
```

**Panel 3: Checkpoint Performance**
```promql
rate(checkpoint_save_duration_seconds_sum[5m])
  / rate(checkpoint_save_duration_seconds_count[5m])
```

---

## Timeline & Milestones

### Week 1: Core Implementation

**Day 1-2:**
- ✅ Create MySQL checkpointer service
- ✅ Define conversation state schema
- ✅ Database migrations

**Day 3-4:**
- ✅ Update retrieval workflow với checkpointer
- ✅ Implement loadHistory và saveHistory nodes
- ✅ Unit tests cho checkpointer

**Day 5:**
- ✅ MCP server integration
- ✅ Extract conversationId from extra._meta
- ✅ Integration tests

### Week 2: Advanced Features

**Day 1-2:**
- ✅ Implement enrichQueryWithHistory
- ✅ Query rewriting với LLM
- ✅ Conversation analytics

**Day 3-4:**
- ✅ TTL và cleanup jobs
- ✅ Metrics instrumentation
- ✅ Grafana dashboards

**Day 5:**
- ✅ E2E testing
- ✅ Performance tuning
- ✅ Documentation

### Week 3: Production Readiness

**Day 1-2:**
- ✅ Security review
- ✅ RBAC verification
- ✅ Load testing

**Day 3-4:**
- ✅ Deployment preparation
- ✅ Monitoring setup
- ✅ Runbook creation

**Day 5:**
- ✅ Production deployment
- ✅ Smoke tests
- ✅ Post-deployment monitoring

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Checkpoint storage growth | High storage costs | High | Implement TTL cleanup, compression |
| Slow checkpoint operations | Increased latency | Medium | Optimize queries, add indexes, use async |
| Conversation context confusion | Wrong results | Low | Clear conversation boundaries, logging |
| MySQL connection pool exhaustion | Service degradation | Medium | Connection pooling config, monitoring |
| Privacy/RBAC violations | Security issue | Low | Thorough testing, audit logs |

---

## Appendix

### A. Conversation State Example

```json
{
  "queries": [
    {
      "query": "What is RAG?",
      "timestamp": "2025-11-14T10:00:00Z",
      "topK": 10
    },
    {
      "query": "How does it improve accuracy?",
      "timestamp": "2025-11-14T10:02:30Z",
      "topK": 10
    }
  ],
  "retrievedContexts": [
    {
      "parentChunkId": "chunk-123",
      "documentId": "doc-456",
      "content": "RAG combines retrieval with generation...",
      "score": 0.92,
      "timestamp": "2025-11-14T10:00:01Z",
      "queryIndex": 0
    }
  ],
  "conversationId": "ba971ddd-9344-437e-b846-3ea1de5cbcd8",
  "userId": "user-789",
  "datasourceIds": ["ds-1", "ds-2"]
}
```

### B. References

- [LangGraph Persistence Docs](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph Memory Guide](https://docs.langchain.com/oss/javascript/concepts/memory)
- [BaseCheckpointSaver API](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)

---

**Document Status:** Ready for Implementation
**Next Steps:** Begin Week 1 implementation tasks
**Owner:** Retrieval Team
**Reviewers:** Architecture Team, Security Team
