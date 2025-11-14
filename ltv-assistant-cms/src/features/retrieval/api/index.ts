import apiClient from '@/shared/api/axios';
import type { QueryRequest, QueryResponse } from '../types';

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

export * from '../types';
