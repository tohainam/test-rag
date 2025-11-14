export interface QueryRequest {
  query: string;
  mode?: 'retrieval_only' | 'generation';
  topK?: number;
  useCache?: boolean; // Allow disabling semantic cache per query (default: true)
}

export interface ChildChunk {
  chunkId: string;
  content: string;
  score: number;
}

export interface ContextMetadata {
  sectionPath?: string[];
  pageNumber?: number;
  documentTitle?: string;
  documentType?: string;
}

export interface Context {
  parentChunkId: string;
  documentId: string;
  content: string;
  tokens: number;
  score: number;
  metadata: ContextMetadata;
  sources: {
    childChunks: ChildChunk[];
  };
}

export interface TransformationMetrics {
  reformulatedCount: number;
  decomposedCount: number;
  rewriteApplied: boolean;
  hydeApplied: boolean;
}

export interface QueryMetrics {
  totalDuration: number;
  cacheHit: boolean;
  qdrantResultCount: number;
  rerankedResultCount: number;
  parentChunkCount: number;
  iterations: number;
  sufficiencyScore: number;
  transformationMetrics?: TransformationMetrics;
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
