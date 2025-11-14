import apiClient from '@/shared/api/axios';
import type { ChildChunksResponse, FileDetails, ParentChunksResponse } from '../types';

export const filesApi = {
  async getFileDetails(fileId: string): Promise<FileDetails> {
    const response = await apiClient.get(`/files/${fileId}/details`);
    return response.data;
  },

  async getParentChunks(
    fileId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<ParentChunksResponse> {
    const response = await apiClient.get(`/files/${fileId}/parent-chunks`, {
      params: { page, limit },
    });
    return response.data;
  },

  async getChildChunks(
    fileId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<ChildChunksResponse> {
    const response = await apiClient.get(`/files/${fileId}/child-chunks`, {
      params: { page, limit },
    });
    return response.data;
  },

  async retryFileIndexing(fileId: string): Promise<{ message: string; fileId: string }> {
    const response = await apiClient.post(`/files/${fileId}/retry`);
    return response.data;
  },
};

// Re-export types for backward compatibility
export type {
  ChildChunk,
  ChildChunksResponse,
  ChunkMetadata,
  FileDetails,
  ParentChunk,
  ParentChunksResponse,
} from '../types';
