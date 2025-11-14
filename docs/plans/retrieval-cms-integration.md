# LTV Assistant - Kế hoạch Tích hợp Retrieval vào CMS

**Phiên bản:** 1.0
**Ngày tạo:** 2025-11-06
**Trạng thái:** Đang triển khai
**Tài liệu liên quan:**
- [retrieval-prd.md](./retrieval-prd.md)
- [retrieval-implement-plan.md](./retrieval-implement-plan.md)
- [system-architecture.md](../system-architecture.md)

---

## Mục lục

1. [Tổng quan tích hợp](#tổng-quan-tích-hợp)
2. [Vai trò người dùng & Kiểm soát truy cập](#vai-trò-người-dùng--kiểm-soát-truy-cập)
3. [Thiết kế UI/UX](#thiết-kế-uiux)
4. [Kiến trúc kỹ thuật](#kiến-trúc-kỹ-thuật)
5. [Kế hoạch triển khai](#kế-hoạch-triển-khai)
6. [Tích hợp API](#tích-hợp-api)
7. [Đặc tả Component](#đặc-tả-component)
8. [Chiến lược kiểm thử](#chiến-lược-kiểm-thử)
9. [Checklist triển khai](#checklist-triển-khai)

---

## Tổng quan tích hợp

### Mục đích

Tích hợp LTV Assistant Retrieval Service (endpoint POST /query) vào CMS dựa trên React để cho phép tất cả người dùng đã xác thực (SUPER_ADMIN, ADMIN, và USER) tìm kiếm và truy xuất ngữ cảnh tài liệu bằng khả năng RAG nâng cao.

### Phạm vi

**Phase 1: UI Tìm kiếm & Truy xuất cốt lõi**
- ✅ Giao diện nhập query với tùy chọn nâng cao
- ✅ Tìm kiếm thời gian thực với trạng thái loading
- ✅ Hiển thị kết quả context
- ✅ Hiển thị thông tin metadata của tài liệu
- ✅ Kiểm soát truy cập (tất cả authenticated users)
- ✅ Backend xử lý RBAC - frontend chỉ hiển thị

**Phase 2: Tính năng nâng cao (Tương lai)**
- ⏸️ Lịch sử query & lưu tìm kiếm
- ⏸️ Chuyển đổi chế độ generation (sinh câu trả lời)
- ⏸️ Giao diện hội thoại đa lượt
- ⏸️ Xuất kết quả tìm kiếm
- ⏸️ Dashboard phân tích tìm kiếm

---

## Vai trò người dùng & Kiểm soát truy cập

### Ma trận Phân quyền

Dựa trên [system-architecture.md](../system-architecture.md) Authorization Architecture:

| Tính năng | SUPER_ADMIN | ADMIN | USER |
|-----------|-------------|-------|------|
| **Truy cập trang Retrieval** | ✅ Có | ✅ Có | ✅ Có |
| **Tìm kiếm tài liệu** | ✅ Có | ✅ Có | ✅ Có |

### Triển khai Kiểm soát Truy cập

**🎯 QUAN TRỌNG: Backend xử lý TẤT CẢ access control**

**Backend (Retrieval Service):**
- ✅ Backend đã triển khai RBAC đầy đủ qua node `buildAccessFilter`
- ✅ Backend chỉ trả về tài liệu mà user có quyền truy cập
- ✅ SUPER_ADMIN: Không filter (truy cập full)
- ✅ ADMIN: Filter tự động (public + created_by + whitelist)
- ✅ USER: Filter tự động (public + whitelist)
- ✅ Backend đảm bảo không có tài liệu nào bị lộ ra ngoài quyền

**Frontend (CMS):**
- ✅ Chỉ cần bảo vệ route với `ProtectedRoute` (tất cả authenticated users)
- ✅ Gọi API và hiển thị kết quả
- ✅ **KHÔNG CẦN** filter hoặc kiểm tra quyền truy cập tài liệu
- ✅ **KHÔNG CẦN** lo lắng về việc hiển thị tài liệu không được phép
- ✅ Backend đã đảm bảo mọi context trả về đều hợp lệ

**Đơn giản hóa:**
```typescript
// ❌ KHÔNG CẦN làm như này trong CMS:
if (userRole === 'SUPER_ADMIN' || hasAccess(documentId)) {
  // Show document
}

// ✅ CHỈ CẦN làm như này:
// Backend đã filter, chỉ việc hiển thị
contexts.map(context => <ContextCard context={context} />)
```

---

## Thiết kế UI/UX

### Bố cục Trang

```
┌─────────────────────────────────────────────────────────────┐
│                    Navigation chính                          │
│  Dashboard | Documents | Retrieval | Users | Settings       │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  🔍 Tìm kiếm Tài liệu                                       │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Nhập câu truy vấn                                   │   │
│  │  [                                             ] 🔍  │   │
│  │                                                      │   │
│  │  Tùy chọn nâng cao                                   │   │
│  │  Số kết quả: [10] ▼    Chế độ: [chỉ truy xuất] ▼   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  📊 Kết quả (10 contexts trong 1.2s)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Context 1                    Điểm: 0.89            │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │   │
│  │  📄 Tài liệu: "Hướng dẫn triển khai RAG"            │   │
│  │  📍 Mục: "Query Transformation"                     │   │
│  │  📏 Tokens: 1,245                                   │   │
│  │                                                      │   │
│  │  Nội dung:                                          │   │
│  │  Để triển khai query transformation, bạn cần...    │   │
│  │  [Xem thêm]                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│  ... (9 contexts khác)                                       │
└─────────────────────────────────────────────────────────────┘
```

### Cấu trúc Component

```
RetrievalPage
├── SearchBar
│   ├── QueryInput (Textarea tự động resize)
│   ├── SearchButton
│   └── AdvancedOptions
│       ├── TopKSelect
│       └── ModeSelect (retrieval_only | generation)
├── ResultsHeader
│   ├── ResultCount
│   └── SearchDuration
└── ContextList
    └── ContextCard (cho mỗi context)
        ├── ContextHeader
        │   ├── DocumentTitle
        │   ├── RelevanceScore
        │   └── SectionPath
        └── ContextContent
            ├── ContentPreview
            └── ShowMoreButton
```

---

## Kiến trúc kỹ thuật

### Frontend Stack

| Lớp | Công nghệ | Mục đích |
|-----|-----------|----------|
| UI Framework | React 18 + TypeScript | Component-based UI |
| Routing | React Router v6 | Navigation & bảo vệ route |
| State Management | React Query (TanStack Query) | Server state, caching, loading states |
| UI Components | Mantine v7 | Design system, form controls |
| HTTP Client | Axios | API requests đến API Gateway |
| Code Splitting | React.lazy() | Tối ưu performance |

### Luồng Tích hợp API

```
User nhập Query
    ↓
CMS Frontend (localhost:30000)
    ↓
POST http://localhost:50050/query
    ↓
API Gateway (localhost:50050)
    • Trích xuất JWT từ Authorization header
    • TCP call đến Auth Service → verify_token
    • Gắn X-User-Id, X-User-Email, X-User-Role
    ↓
Proxy đến Retrieval Service (localhost:50056)
    ↓
Retrieval Service
    • Thực thi LangGraph workflow
    • ÁP DỤNG access control filter dựa trên role
    • CHỈ TRẢ VỀ contexts mà user có quyền truy cập
    • Backend đảm bảo 100% security
    ↓
API Gateway → CMS Frontend
    ↓
Hiển thị Kết quả (tất cả đều hợp lệ, không cần filter)
```

### Cấu trúc Thư mục

```
ltv-assistant-cms/src/
├── features/
│   └── retrieval/                    # MỚI: Feature retrieval
│       ├── api/
│       │   ├── index.ts              # API client functions
│       │   └── types.ts              # Request/Response types
│       ├── ui/
│       │   ├── SearchBar.tsx
│       │   ├── AdvancedOptions.tsx
│       │   ├── TransformationMetrics.tsx
│       │   ├── ContextCard.tsx
│       │   ├── ContextList.tsx
│       │   └── index.ts
│       ├── hooks/
│       │   ├── useRetrievalQuery.ts  # React Query hook
│       │   └── index.ts
│       └── types/
│           └── index.ts              # Shared types
├── pages/
│   └── retrieval/
│       └── ui/
│           └── RetrievalPage.tsx     # MỚI: Trang retrieval chính
├── shared/
│   ├── api/
│   │   └── client.ts                 # Axios instance (đã có)
│   └── config/
│       └── routes.ts                 # Thêm ROUTES.RETRIEVAL
└── app/
    └── router/
        └── index.tsx                 # Thêm retrieval route
```

---

## Kế hoạch triển khai

### Phase 1: Tích hợp cốt lõi (Tuần 1-2)

#### Tuần 1: Setup & Tích hợp API

**Ngày 1-2: Định nghĩa Type & API Client**

- [ ] **Tạo retrieval types** (`features/retrieval/api/types.ts`)
  ```typescript
  export interface QueryRequest {
    query: string;
    mode?: 'retrieval_only' | 'generation';
    topK?: number;
  }

  export interface Context {
    parentChunkId: string;
    documentId: string;
    content: string;
    tokens: number;
    score: number;
    metadata: {
      sectionPath?: string[];
      pageNumber?: number;
      documentTitle?: string;
      documentType?: string;
    };
    sources: {
      childChunks: Array<{
        chunkId: string;
        content: string;
        score: number;
      }>;
    };
  }

  export interface QueryMetrics {
    totalDuration: number;
    cacheHit: boolean;
    qdrantResultCount: number;
    rerankedResultCount: number;
    parentChunkCount: number;
    iterations: number;
    sufficiencyScore: number;
    transformationMetrics?: {
      reformulatedCount: number;
      decomposedCount: number;
      rewriteApplied: boolean;
      hydeApplied: boolean;
    };
  }

  export interface QueryResponse {
    success: boolean;
    contexts: Context[];
    metrics: QueryMetrics;
  }

  export interface QueryError {
    statusCode: number;
    message: string;
    error?: string;
  }
  ```

- [ ] **Tạo API client** (`features/retrieval/api/index.ts`)
  ```typescript
  import { apiClient } from '@/shared/api/client';
  import type { QueryRequest, QueryResponse } from './types';

  export const retrievalApi = {
    /**
     * Thực thi retrieval query
     * Endpoint: POST /query
     * Gateway proxy đến Retrieval Service (50056)
     * Backend xử lý TẤT CẢ access control
     */
    query: async (request: QueryRequest): Promise<QueryResponse> => {
      const { data } = await apiClient.post<QueryResponse>('/query', request);
      return data;
    },
  };

  export * from './types';
  ```

**Ngày 3-4: React Query Hook**

- [ ] **Tạo `useRetrievalQuery` hook** (`features/retrieval/hooks/useRetrievalQuery.ts`)
  ```typescript
  import { useMutation } from '@tanstack/react-query';
  import { retrievalApi, QueryRequest, QueryResponse, QueryError } from '../api';

  export interface UseRetrievalQueryOptions {
    onSuccess?: (data: QueryResponse) => void;
    onError?: (error: QueryError) => void;
  }

  export const useRetrievalQuery = (options?: UseRetrievalQueryOptions) => {
    return useMutation<QueryResponse, QueryError, QueryRequest>({
      mutationFn: retrievalApi.query,
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    });
  };
  ```

**Ngày 5: Thiết lập Routing**

- [ ] **Thêm ROUTES.RETRIEVAL** vào `shared/config/routes.ts`
  ```typescript
  export const ROUTES = {
    // ... các routes hiện có
    RETRIEVAL: '/retrieval',
  } as const;
  ```

- [ ] **Thêm retrieval route** vào `app/router/index.tsx`
  ```typescript
  const RetrievalPage = lazy(() =>
    import('@/pages/retrieval/ui').then((module) => ({
      default: module.RetrievalPage,
    }))
  );

  // Trong router children array:
  {
    path: ROUTES.RETRIEVAL,
    element: (
      <ProtectedRoute>
        <RetrievalPage />
      </ProtectedRoute>
    ),
  },
  ```

  **Lưu ý:** Không cần `allowedRoles` - tất cả authenticated users đều có thể truy cập. Backend sẽ filter kết quả dựa trên role.

- [ ] **Thêm navigation link** vào main layout
  ```typescript
  // Trong MainLayout navigation
  {
    label: 'Tìm kiếm',
    icon: IconSearch,
    link: ROUTES.RETRIEVAL,
    // Không cần allowedRoles - hiển thị cho tất cả authenticated users
  },
  ```

#### Tuần 2: UI Components

**Ngày 1-2: SearchBar Component**

- [ ] **Tạo SearchBar** (`features/retrieval/ui/SearchBar.tsx`)
  ```typescript
  import { useState } from 'react';
  import { Stack, Textarea, Button, Group } from '@mantine/core';
  import { IconSearch } from '@tabler/icons-react';
  import { AdvancedOptions } from './AdvancedOptions';

  interface SearchBarProps {
    onSearch: (query: string, topK: number, mode: string) => void;
    isLoading: boolean;
  }

  export function SearchBar({ onSearch, isLoading }: SearchBarProps) {
    const [query, setQuery] = useState('');
    const [topK, setTopK] = useState(10);
    const [mode, setMode] = useState<'retrieval_only' | 'generation'>('retrieval_only');

    const handleSubmit = () => {
      if (query.trim()) {
        onSearch(query, topK, mode);
      }
    };

    return (
      <Stack gap="md">
        <Textarea
          label="Câu truy vấn"
          placeholder="Nhập câu hỏi của bạn tại đây..."
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          minRows={3}
          autosize
          required
        />

        <AdvancedOptions
          topK={topK}
          setTopK={setTopK}
          mode={mode}
          setMode={setMode}
        />

        <Group justify="flex-end">
          <Button
            leftSection={<IconSearch size={16} />}
            onClick={handleSubmit}
            loading={isLoading}
            disabled={!query.trim() || isLoading}
          >
            Tìm kiếm
          </Button>
        </Group>
      </Stack>
    );
  }
  ```

- [ ] **Tạo AdvancedOptions** (`features/retrieval/ui/AdvancedOptions.tsx`)
  ```typescript
  import { Group, NumberInput, Select } from '@mantine/core';

  interface AdvancedOptionsProps {
    topK: number;
    setTopK: (value: number) => void;
    mode: 'retrieval_only' | 'generation';
    setMode: (value: 'retrieval_only' | 'generation') => void;
  }

  export function AdvancedOptions({ topK, setTopK, mode, setMode }: AdvancedOptionsProps) {
    return (
      <Group gap="md">
        <NumberInput
          label="Số kết quả"
          description="Số lượng contexts cần truy xuất"
          value={topK}
          onChange={(value) => setTopK(Number(value))}
          min={1}
          max={50}
          style={{ width: 200 }}
        />

        <Select
          label="Chế độ"
          description="Chế độ truy xuất"
          value={mode}
          onChange={(value) => setMode(value as 'retrieval_only' | 'generation')}
          data={[
            { value: 'retrieval_only', label: 'Chỉ truy xuất' },
            { value: 'generation', label: 'Sinh câu trả lời (Phase 2)' },
          ]}
          disabled // Phase 1: chỉ retrieval_only
          style={{ width: 250 }}
        />
      </Group>
    );
  }
  ```

**Ngày 3-4: Context Display Components**

- [ ] **Tạo ContextCard** (`features/retrieval/ui/ContextCard.tsx`)
  ```typescript
  import { useState } from 'react';
  import { Card, Text, Badge, Group, Stack, Button } from '@mantine/core';
  import { IconFile } from '@tabler/icons-react';
  import { Context } from '../api/types';

  interface ContextCardProps {
    context: Context;
    index: number;
  }

  export function ContextCard({ context, index }: ContextCardProps) {
    const [showFullContent, setShowFullContent] = useState(false);

    const contentPreview = context.content.slice(0, 300);
    const hasMore = context.content.length > 300;

    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          {/* Header */}
          <Group justify="space-between">
            <Group>
              <IconFile size={20} />
              <Text fw={600} size="lg">
                Context {index + 1}
              </Text>
            </Group>
            <Badge color="blue" variant="filled">
              Điểm: {context.score.toFixed(3)}
            </Badge>
          </Group>

          {/* Metadata */}
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              <strong>Tài liệu:</strong> {context.metadata.documentTitle || 'Không rõ'}
            </Text>
            {context.metadata.sectionPath && (
              <Text size="sm" c="dimmed">
                <strong>Mục:</strong> {context.metadata.sectionPath.join(' > ')}
              </Text>
            )}
            <Text size="sm" c="dimmed">
              <strong>Tokens:</strong> {context.tokens.toLocaleString()}
            </Text>
          </Stack>

          {/* Content */}
          <Stack gap="xs">
            <Text fw={500}>Nội dung:</Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {showFullContent ? context.content : contentPreview}
              {hasMore && !showFullContent && '...'}
            </Text>
            {hasMore && (
              <Button
                variant="subtle"
                size="xs"
                onClick={() => setShowFullContent(!showFullContent)}
              >
                {showFullContent ? 'Thu gọn' : 'Xem thêm'}
              </Button>
            )}
          </Stack>
        </Stack>
      </Card>
    );
  }
  ```

- [ ] **Tạo ContextList** (`features/retrieval/ui/ContextList.tsx`)
  ```typescript
  import { Stack, Text } from '@mantine/core';
  import { ContextCard } from './ContextCard';
  import { Context } from '../api/types';

  interface ContextListProps {
    contexts: Context[];
  }

  export function ContextList({ contexts }: ContextListProps) {
    if (contexts.length === 0) {
      return (
        <Text c="dimmed" ta="center" mt="xl">
          Không tìm thấy kết quả. Thử với câu truy vấn khác.
        </Text>
      );
    }

    return (
      <Stack gap="md">
        {contexts.map((context, index) => (
          <ContextCard key={context.parentChunkId} context={context} index={index} />
        ))}
      </Stack>
    );
  }
  ```

**Ngày 5-6: Tích hợp Trang chính**

- [ ] **Tạo RetrievalPage** (`pages/retrieval/ui/RetrievalPage.tsx`)
  ```typescript
  import { useState } from 'react';
  import { Container, Title, Stack, Text, Group, Badge, Alert, Loader } from '@mantine/core';
  import { IconInfoCircle } from '@tabler/icons-react';
  import { SearchBar } from '@/features/retrieval/ui/SearchBar';
  import { ContextList } from '@/features/retrieval/ui/ContextList';
  import { useRetrievalQuery } from '@/features/retrieval/hooks/useRetrievalQuery';
  import { QueryResponse } from '@/features/retrieval/api/types';

  export function RetrievalPage() {
    const [results, setResults] = useState<QueryResponse | null>(null);

    const { mutate: executeQuery, isPending, error } = useRetrievalQuery({
      onSuccess: (data) => {
        setResults(data);
      },
    });

    const handleSearch = (query: string, topK: number, mode: string) => {
      executeQuery({
        query,
        topK,
        mode: mode as 'retrieval_only' | 'generation',
      });
    };

    return (
      <Container size="xl" py="xl">
        <Stack gap="xl">
          <Title order={1}>Tìm kiếm Tài liệu</Title>

          <Alert icon={<IconInfoCircle size={16} />} title="Tìm kiếm RAG nâng cao" color="blue">
            Tìm kiếm trên tất cả tài liệu bạn có quyền truy cập bằng các kỹ thuật chuyển đổi query tiên tiến.
            Hệ thống sử dụng reformulation, rewriting, HyDE và decomposition để cải thiện chất lượng tìm kiếm.
          </Alert>

          <SearchBar onSearch={handleSearch} isLoading={isPending} />

          {error && (
            <Alert icon={<IconInfoCircle size={16} />} title="Lỗi" color="red">
              {error.message || 'Đã xảy ra lỗi khi xử lý truy vấn của bạn.'}
            </Alert>
          )}

          {isPending && (
            <Group justify="center" py="xl">
              <Loader size="lg" />
              <Text>Đang tìm kiếm tài liệu...</Text>
            </Group>
          )}

          {results && (
            <Stack gap="lg">
              {/* Results Header */}
              <Group justify="space-between">
                <Group gap="md">
                  <Text fw={600} size="lg">
                    Kết quả
                  </Text>
                  <Badge color="blue" variant="filled">
                    {results.contexts.length} contexts
                  </Badge>
                  <Badge color="gray" variant="light">
                    {results.metrics.totalDuration.toFixed(0)}ms
                  </Badge>
                  {results.metrics.cacheHit && (
                    <Badge color="green" variant="light">
                      Cache Hit
                    </Badge>
                  )}
                </Group>
              </Group>

              {/* Context List - Backend đã filter, chỉ việc hiển thị */}
              <ContextList contexts={results.contexts} />
            </Stack>
          )}
        </Stack>
      </Container>
    );
  }
  ```

---

## Tích hợp API

### Ví dụ Request

**Query cơ bản:**
```typescript
const response = await retrievalApi.query({
  query: 'Làm thế nào để triển khai RAG với LangChain?',
  topK: 10,
  mode: 'retrieval_only',
});
```

**Với tùy chọn nâng cao:**
```typescript
const response = await retrievalApi.query({
  query: 'Giải thích các kỹ thuật query transformation',
  topK: 5,
  mode: 'retrieval_only',
});
```

### Xử lý Response

**Trường hợp thành công:**
```typescript
{
  success: true,
  contexts: [
    {
      parentChunkId: "chunk-123",
      documentId: "doc-456",
      content: "Để triển khai RAG với LangChain...",
      tokens: 1245,
      score: 0.89,
      metadata: {
        sectionPath: ["Chương 1", "RAG Cơ bản"],
        pageNumber: 12,
        documentTitle: "Hướng dẫn triển khai RAG",
        documentType: "public"
      },
      sources: {
        childChunks: [
          {
            chunkId: "child-1",
            content: "LangChain cung cấp...",
            score: 0.92
          }
        ]
      }
    }
  ],
  metrics: {
    totalDuration: 1200,
    cacheHit: false,
    qdrantResultCount: 20,
    rerankedResultCount: 15,
    parentChunkCount: 10,
    iterations: 1,
    sufficiencyScore: 0.85,
    transformationMetrics: {
      reformulatedCount: 5,
      decomposedCount: 3,
      rewriteApplied: true,
      hydeApplied: true
    }
  }
}
```

**Trường hợp lỗi:**
```typescript
// 400 Bad Request
{
  statusCode: 400,
  message: "Định dạng query không hợp lệ",
  error: "Bad Request"
}

// 401 Unauthorized
{
  statusCode: 401,
  message: "Chưa xác thực",
  error: "Unauthorized"
}

// 403 Forbidden
{
  statusCode: 403,
  message: "Từ chối truy cập: Không tìm thấy tài liệu có quyền truy cập",
  error: "Forbidden"
}

// 500 Internal Server Error
{
  statusCode: 500,
  message: "Retrieval workflow thất bại",
  error: "Internal Server Error"
}
```

### Chiến lược Xử lý Lỗi

```typescript
import { AxiosError } from 'axios';
import { notifications } from '@mantine/notifications';

export const handleRetrievalError = (error: unknown) => {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const message = error.response?.data?.message || 'Lỗi không xác định';

    switch (status) {
      case 400:
        notifications.show({
          title: 'Query không hợp lệ',
          message: 'Vui lòng kiểm tra lại câu truy vấn.',
          color: 'red',
        });
        break;
      case 401:
        notifications.show({
          title: 'Chưa xác thực',
          message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
          color: 'red',
        });
        // Redirect về login
        break;
      case 403:
        notifications.show({
          title: 'Từ chối truy cập',
          message: 'Bạn không có quyền truy cập bất kỳ tài liệu nào.',
          color: 'red',
        });
        break;
      case 500:
        notifications.show({
          title: 'Lỗi máy chủ',
          message: 'Đã xảy ra lỗi khi xử lý truy vấn.',
          color: 'red',
        });
        break;
      default:
        notifications.show({
          title: 'Lỗi',
          message: message,
          color: 'red',
        });
    }
  }
};
```

---

## Đặc tả Component

### SearchBar Component

**Props:**
```typescript
interface SearchBarProps {
  onSearch: (query: string, topK: number, mode: string) => void;
  isLoading: boolean;
}
```

**State:**
- `query: string` - Query từ user
- `topK: number` - Số kết quả (1-50)
- `mode: 'retrieval_only' | 'generation'` - Chế độ retrieval

**Validation:**
- Query không được rỗng
- Query tối thiểu 3 ký tự
- topK trong khoảng: 1-50

**Accessibility:**
- Label cho textarea
- Keyboard navigation (Enter để submit với Ctrl/Cmd)
- Trạng thái loading vô hiệu hóa form
- Focus management

---

### ContextCard Component

**Props:**
```typescript
interface ContextCardProps {
  context: Context;
  index: number;
}
```

**Tính năng:**
- Hiển thị thông tin context (tiêu đề, mục, số tokens)
- Mở rộng/thu gọn nội dung
- Badge điểm với mã màu:
  - 0.8-1.0: xanh lá (liên quan cao)
  - 0.6-0.8: xanh dương (liên quan trung bình)
  - < 0.6: cam (liên quan thấp)

**⚠️ LƯU Ý QUAN TRỌNG:**
- **KHÔNG CẦN** kiểm tra quyền truy cập tài liệu
- **Backend đã đảm bảo** mọi context trả về đều hợp lệ
- Chỉ việc hiển thị thông tin

**Accessibility:**
- Semantic HTML (article, header, footer)
- ARIA labels cho buttons
- Keyboard navigation

---


## Chiến lược kiểm thử

### Unit Tests

**Phạm vi kiểm thử:**
- [ ] API client functions
- [ ] Custom hooks (useRetrievalQuery)
- [ ] Component rendering
- [ ] User interactions (search, expand, copy)
- [ ] Error handling

**Ví dụ Test:**
```typescript
// features/retrieval/__tests__/useRetrievalQuery.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRetrievalQuery } from '../hooks/useRetrievalQuery';
import { retrievalApi } from '../api';

jest.mock('../api');

describe('useRetrievalQuery', () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('nên thực thi query và trả về kết quả', async () => {
    const mockResponse = {
      success: true,
      contexts: [],
      metrics: {
        totalDuration: 1000,
        cacheHit: false,
        qdrantResultCount: 10,
        rerankedResultCount: 10,
        parentChunkCount: 10,
        iterations: 1,
        sufficiencyScore: 0.8,
      },
    };

    (retrievalApi.query as jest.Mock).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useRetrievalQuery(), { wrapper });

    result.current.mutate({ query: 'test', topK: 10 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockResponse);
  });
});
```

### Integration Tests

**Kịch bản Test:**
- [ ] Luồng tìm kiếm đầy đủ (input → submit → hiển thị kết quả)
- [ ] Xử lý lỗi (network error, 400, 401, 403, 500)
- [ ] Điều hướng tài liệu từ context
- [ ] Copy vào clipboard

### E2E Tests (Tùy chọn)

**Test Cases:**
- [ ] Login với ADMIN → Điều hướng Retrieval → Thực thi tìm kiếm → Xác minh kết quả
- [ ] Login với SUPER_ADMIN → Thực thi tìm kiếm → Xác minh tất cả tài liệu có thể truy cập
- [ ] Login với USER → Xác minh trang Retrieval không thể truy cập (403)

---

## Checklist triển khai

### Trước triển khai

- [ ] **Backend sẵn sàng**
  - [ ] Retrieval service chạy trên port 50056
  - [ ] API Gateway proxy /query đến retrieval service
  - [ ] Authentication hoạt động (JWT validation)
  - [ ] Access control filters đã triển khai
  - [ ] BGE-Reranker service khả dụng (port 6201)
  - [ ] Ollama embedding service khả dụng (port 11434)

- [ ] **Environment Variables**
  ```bash
  # .env (ltv-assistant-cms)
  VITE_API_URL=http://localhost:50050
  VITE_APP_NAME=LTV Assistant CMS
  ```

- [ ] **Chất lượng code**
  - [ ] Tất cả TypeScript errors đã giải quyết
  - [ ] ESLint checks pass
  - [ ] Không có `any` types
  - [ ] Không có `as` type assertions
  - [ ] Strong typing toàn bộ

### Các bước Triển khai

1. **Build CMS:**
   ```bash
   cd ltv-assistant-cms
   npm run build
   ```

2. **Test trong staging:**
   - [ ] Xác minh trang retrieval load
   - [ ] Thực thi test queries
   - [ ] Xác minh access control
   - [ ] Kiểm tra xử lý lỗi

3. **Deploy lên production:**
   - [ ] Deploy CMS lên CDN/hosting
   - [ ] Cập nhật CORS settings của API Gateway
   - [ ] Monitor error logs

### Sau triển khai

- [ ] **Smoke Tests**
  - [ ] Login với SUPER_ADMIN → Thực thi tìm kiếm → Xác minh kết quả
  - [ ] Login với ADMIN → Thực thi tìm kiếm → Xác minh kết quả được filter
  - [ ] Xác minh response times < 3s

- [ ] **Monitoring**
  - [ ] Theo dõi tỷ lệ query thành công
  - [ ] Monitor error rates
  - [ ] Theo dõi average response time
  - [ ] Monitor user adoption

---

## Phase 2: Tính năng nâng cao (Tương lai)

### Lịch sử Query & Lưu Tìm kiếm

**Tính năng:**
- Lưu queries thường dùng
- Truy cập nhanh các tìm kiếm gần đây
- Chia sẻ saved searches với team

**Triển khai:**
- Lưu trong localStorage hoặc backend database
- Thêm nút "Lưu Query"
- Hiển thị lịch sử trong sidebar

### Chế độ Generation

**Tính năng:**
- Chuyển đổi giữa retrieval_only và generation
- Hiển thị câu trả lời được sinh với nguồn
- Hỗ trợ streaming response

**Triển khai:**
- Bật mode selector trong AdvancedOptions
- Thêm AnswerDisplay component
- Tích hợp với LangGraph generation node

### Hội thoại Đa lượt

**Tính năng:**
- Câu hỏi follow-up với ngữ cảnh
- Hiển thị lịch sử hội thoại
- Tham chiếu đến câu trả lời trước

**Triển khai:**
- Thêm hỗ trợ thread_id
- Sử dụng LangGraph checkpointer
- ConversationPanel component

### Analytics Dashboard

**Tính năng:**
- Tỷ lệ query thành công
- Thời gian response trung bình
- Tài liệu được tìm kiếm nhiều nhất
- Metrics tương tác user

**Triển khai:**
- Theo dõi query metrics trong backend
- Tạo analytics API endpoints
- Build dashboard page với charts

---

## Tiêu chí Chấp nhận

### Checklist Hoàn thành Phase 1

- [ ] **Routing & Access Control**
  - [ ] Route /retrieval đã được thêm vào router
  - [ ] Route được bảo vệ với ProtectedRoute (tất cả authenticated users)
  - [ ] Tất cả users đã đăng nhập có thể truy cập trang retrieval
  - [ ] Navigation link hiển thị cho tất cả authenticated users
  - [ ] Backend filter kết quả dựa trên user role

- [ ] **Chức năng Tìm kiếm**
  - [ ] Query input nhận text
  - [ ] topK selector hoạt động (1-50)
  - [ ] Nút tìm kiếm kích hoạt API call
  - [ ] Trạng thái loading hiển thị trong khi tìm kiếm
  - [ ] Thông báo lỗi hiển thị khi thất bại

- [ ] **Hiển thị Kết quả**
  - [ ] Contexts hiển thị trong cards
  - [ ] Score badges hiển thị với mã màu
  - [ ] Document metadata hiển thị chính xác
  - [ ] Content preview với expand/collapse

- [ ] **Content Display**
  - [ ] Nội dung được hiển thị đầy đủ hoặc preview
  - [ ] Nút expand/collapse hoạt động đúng

- [ ] **Metrics**
  - [ ] Số lượng kết quả hiển thị
  - [ ] Thời gian tìm kiếm hiển thị
  - [ ] Cache hit indicator hiển thị

- [ ] **Access Control (Backend xử lý)**
  - [ ] SUPER_ADMIN thấy tất cả tài liệu trong kết quả
  - [ ] ADMIN chỉ thấy tài liệu có quyền truy cập (public + created_by + whitelist)
  - [ ] USER chỉ thấy tài liệu có quyền truy cập (public + whitelist)
  - [ ] CMS không cần kiểm tra quyền, backend đã đảm bảo

- [ ] **Chất lượng Code**
  - [ ] Không có TypeScript `any` types
  - [ ] Không có `as` type assertions
  - [ ] Strong typing toàn bộ
  - [ ] ESLint checks pass
  - [ ] Components tuân theo React best practices

- [ ] **Performance**
  - [ ] Trang load trong < 1s
  - [ ] Kết quả tìm kiếm hiển thị trong < 3s
  - [ ] Không memory leaks
  - [ ] Scrolling và interactions mượt mà

---

## Tài liệu Tham khảo

1. **[retrieval-prd.md](./retrieval-prd.md)** - Retrieval Service PRD
2. **[retrieval-implement-plan.md](./retrieval-implement-plan.md)** - Hướng dẫn Triển khai
3. **[system-architecture.md](../system-architecture.md)** - Kiến trúc Hệ thống & RBAC
4. **[Mantine Documentation](https://mantine.dev/)** - UI Component Library
5. **[React Query](https://tanstack.com/query/latest)** - Server State Management
6. **[React Router v6](https://reactrouter.com/)** - Routing

---

## Phụ lục A: API Reference

### POST /query

**Endpoint:** `http://localhost:50050/query`

**Request:**
```json
{
  "query": "Làm thế nào để triển khai RAG với LangChain?",
  "topK": 10,
  "mode": "retrieval_only"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "contexts": [
    {
      "parentChunkId": "chunk-123",
      "documentId": "doc-456",
      "content": "Nội dung parent chunk đầy đủ...",
      "tokens": 1245,
      "score": 0.89,
      "metadata": {
        "sectionPath": ["Chương 1", "RAG Cơ bản"],
        "pageNumber": 12,
        "documentTitle": "Hướng dẫn triển khai RAG",
        "documentType": "public"
      },
      "sources": {
        "childChunks": [
          {
            "chunkId": "child-1",
            "content": "Nội dung child chunk...",
            "score": 0.92
          }
        ]
      }
    }
  ],
  "metrics": {
    "totalDuration": 1200,
    "cacheHit": false,
    "qdrantResultCount": 20,
    "rerankedResultCount": 15,
    "parentChunkCount": 10,
    "iterations": 1,
    "sufficiencyScore": 0.85,
    "transformationMetrics": {
      "reformulatedCount": 5,
      "decomposedCount": 3,
      "rewriteApplied: true,
      "hydeApplied": true
    }
  }
}
```

---

## Phụ lục B: Component Props Reference

### SearchBar
```typescript
interface SearchBarProps {
  onSearch: (query: string, topK: number, mode: string) => void;
  isLoading: boolean;
}
```

### ContextCard
```typescript
interface ContextCardProps {
  context: Context;
  index: number;
}
```

### ContextList
```typescript
interface ContextListProps {
  contexts: Context[];
}
```

### TransformationMetrics
```typescript
interface TransformationMetricsProps {
  metrics: QueryMetrics;
}
```

### AdvancedOptions
```typescript
interface AdvancedOptionsProps {
  topK: number;
  setTopK: (value: number) => void;
  mode: 'retrieval_only' | 'generation';
  setMode: (value: 'retrieval_only' | 'generation') => void;
}
```

---

## Phụ lục C: Giải thích Đơn giản hóa Access Control

### ❌ Cách CŨ (Phức tạp - Không cần làm)

```typescript
// CMS phải kiểm tra quyền trước khi hiển thị
function ContextCard({ context, userRole, userId }) {
  // ❌ Không cần làm thế này
  const canViewDocument = checkDocumentAccess(
    context.documentId,
    userRole,
    userId
  );

  return (
    <Card>
      {canViewDocument ? (
        <Link to={`/documents/${context.documentId}`}>
          Xem tài liệu
        </Link>
      ) : (
        <Text c="dimmed">Không có quyền</Text>
      )}
    </Card>
  );
}
```

### ✅ Cách MỚI (Đơn giản - Backend xử lý)

```typescript
// Backend đã đảm bảo mọi context đều hợp lệ
function ContextCard({ context }: ContextCardProps) {
  // ✅ Chỉ việc hiển thị, không cần kiểm tra
  return (
    <Card>
      <Link to={`/documents/${context.documentId}`}>
        Xem tài liệu
      </Link>
    </Card>
  );
}
```

### Lý do Đơn giản hóa

1. **Backend đã filter 100%** - Retrieval service chỉ trả về documents user có quyền
2. **Giảm complexity** - Frontend không cần duplicate logic kiểm tra quyền
3. **Single source of truth** - Access control logic chỉ ở một nơi (backend)
4. **Bảo mật cao hơn** - Không thể bypass frontend checks

---

---

## Tóm tắt Thay đổi Quyền Truy cập

**Cập nhật:** Trang Retrieval giờ đây mở cho TẤT CẢ authenticated users (SUPER_ADMIN, ADMIN, USER)

**Lý do:**
- Cho phép tất cả users tận dụng khả năng tìm kiếm RAG
- Backend đã xử lý RBAC đầy đủ - mỗi user chỉ thấy documents họ có quyền
- Đơn giản hóa frontend - không cần role checks

**Access Control Matrix:**
```
SUPER_ADMIN → Tất cả documents (no filter)
ADMIN       → Public + Created by self + Whitelisted
USER        → Public + Whitelisted
```

---

**Kết thúc Kế hoạch Tích hợp**

**Trạng thái:** Sẵn sàng Triển khai
**Cập nhật lần cuối:** 2025-11-06
**Xem xét tiếp theo:** Sau khi hoàn thành Phase 1
