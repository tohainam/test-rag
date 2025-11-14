import apiClient from '@/shared/api/axios';
import type {
  AddUserToDocumentDto,
  CompleteUploadResponse,
  CreateDocumentDto,
  Document,
  DocumentDetailsResponse,
  DocumentsListResponse,
  DocumentUser,
  DownloadUrlResponse,
  MultipartUploadResponse,
  PresignedUrlResponse,
  UpdateDocumentDto,
} from '../types';

export const documentsApi = {
  // Document CRUD
  async getDocuments(params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: 'public' | 'restricted';
  }): Promise<DocumentsListResponse> {
    const response = await apiClient.get('/documents', { params });
    return response.data;
  },

  async getDocument(id: string): Promise<DocumentDetailsResponse> {
    const response = await apiClient.get(`/documents/${id}`);
    const document = response.data;

    // Fetch files with indexing status
    try {
      const filesResponse = await apiClient.get(`/files/documents/${id}/with-status`);
      return {
        ...document,
        files: filesResponse.data,
      };
    } catch (error) {
      // Fallback to files from document response
      return document;
    }
  },

  async createDocument(data: CreateDocumentDto): Promise<Document> {
    const response = await apiClient.post('/documents', data);
    return response.data;
  },

  async updateDocument(id: string, data: UpdateDocumentDto): Promise<Document> {
    const response = await apiClient.patch(`/documents/${id}`, data);
    return response.data;
  },

  async deleteDocument(id: string): Promise<void> {
    await apiClient.delete(`/documents/${id}`);
  },

  // File upload operations
  async requestPresignedUrl(
    documentId: string,
    data: {
      filename: string;
      filesize: number;
      contentType: string;
      md5Hash?: string;
    }
  ): Promise<PresignedUrlResponse> {
    const response = await apiClient.post(`/files/documents/${documentId}/presigned-url`, data);
    return response.data;
  },

  async initMultipartUpload(
    documentId: string,
    data: {
      filename: string;
      filesize: number;
      contentType: string;
      partsCount: number;
    }
  ): Promise<MultipartUploadResponse> {
    const response = await apiClient.post(`/files/documents/${documentId}/init-multipart`, data);
    return response.data;
  },

  async confirmUpload(fileId: string): Promise<CompleteUploadResponse> {
    const response = await apiClient.post(`/files/${fileId}/confirm-upload`);
    return response.data;
  },

  async completeMultipartUpload(
    fileId: string,
    parts: Array<{ partNumber: number; etag: string }>
  ): Promise<CompleteUploadResponse> {
    const response = await apiClient.post(`/files/${fileId}/complete-multipart`, { parts });
    return response.data;
  },

  async getDownloadUrl(fileId: string): Promise<DownloadUrlResponse> {
    const response = await apiClient.get(`/files/${fileId}/download`);
    return response.data;
  },

  async deleteFile(fileId: string): Promise<void> {
    await apiClient.delete(`/files/${fileId}`);
  },

  async retryFileIndexing(fileId: string): Promise<{ message: string; fileId: string }> {
    const response = await apiClient.post(`/files/${fileId}/retry`);
    return response.data;
  },

  // Document user access management
  async getDocumentUsers(documentId: string): Promise<DocumentUser[]> {
    const response = await apiClient.get(`/documents/${documentId}/users`);
    return response.data;
  },

  async addUserToDocument(documentId: string, data: AddUserToDocumentDto): Promise<DocumentUser> {
    const response = await apiClient.post(`/documents/${documentId}/users`, data);
    return response.data;
  },

  async removeUserFromDocument(documentId: string, userId: string): Promise<void> {
    await apiClient.delete(`/documents/${documentId}/users/${userId}`);
  },
};

// Re-export types for backward compatibility
export type {
  AddUserToDocumentDto,
  CompleteUploadResponse,
  CreateDocumentDto,
  Document,
  DocumentDetailsResponse,
  DocumentsListResponse,
  DocumentUser,
  DownloadUrlResponse,
  File,
  MultipartUploadResponse,
  PresignedUrlResponse,
  UpdateDocumentDto,
} from '../types';
