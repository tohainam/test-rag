export interface Document {
  id: string;
  title: string;
  description?: string;
  type: 'public' | 'restricted';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  fileCount?: number;
}

export interface File {
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
  indexingStatus?: 'pending' | 'processing' | 'completed' | 'failed' | null;
  indexingError?: string | null;
  indexedAt?: string | null;
}

export interface CreateDocumentDto {
  title: string;
  description?: string;
  type?: 'public' | 'restricted';
}

export interface UpdateDocumentDto {
  title?: string;
  description?: string;
  type?: 'public' | 'restricted';
}

export interface DocumentsListResponse {
  data: Document[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DocumentDetailsResponse extends Document {
  files: File[];
}

export interface PresignedUrlResponse {
  fileId: string;
  presignedUrl: string;
  expiresAt: string;
  uploadType: 'single';
}

export interface MultipartUploadResponse {
  fileId: string;
  uploadId: string;
  presignedUrls: Array<{
    partNumber: number;
    url: string;
    expiresAt: string;
  }>;
  uploadType: 'multipart';
  partSize: number;
}

export interface CompleteUploadResponse {
  fileId: string;
  status: string;
  message: string;
}

export interface DownloadUrlResponse {
  fileId: string;
  filename: string;
  presignedUrl: string;
  expiresAt: string;
}

export interface DocumentUser {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
}

export interface AddUserToDocumentDto {
  userId: string;
  expiresAt?: string;
}
