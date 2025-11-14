export interface ChunkMetadata {
  sectionId?: string;
  sectionPath?: string;
  sectionLevel?: number;
  offsetStart?: number;
  offsetEnd?: number;
  pageNumber?: number;
  isOnlyChild?: boolean;
  // Enriched metadata
  entities?: Array<{ text: string; type: string }>;
  keywords?: string[];
  summary?: string; // parent only
  hypotheticalQuestions?: string[]; // parent only
}

export interface ParentChunk {
  id: string;
  fileId: string;
  content: string;
  tokens: number;
  chunkIndex: number;
  metadata: ChunkMetadata;
  createdAt: string;
}

export interface ChildChunk {
  parentChunkIndex?: number; // Parent chunk index for display
  id: string;
  fileId: string;
  parentChunkId: string;
  content: string;
  tokens: number;
  chunkIndex: number;
  metadata: ChunkMetadata;
  createdAt: string;
}

export interface FileDetails {
  id: string;
  documentId: string;
  filename: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  uploadedAt?: string;
  createdAt: string;
  outboxStatus?: 'pending' | 'publishing' | 'published' | 'failed' | 'poison' | null;
  indexingStatus: 'pending' | 'processing' | 'completed' | 'failed' | null;
  indexingError: string | null;
  startedAt: string | null;
  indexedAt: string | null;
  attempts: number;
  parentChunksCount: number;
  childChunksCount: number;
}

export interface ParentChunksResponse {
  success: boolean;
  chunks: ParentChunk[];
  total: number;
  page: number;
  limit: number;
}

export interface ChildChunksResponse {
  success: boolean;
  chunks: ChildChunk[];
  total: number;
  page: number;
  limit: number;
}
