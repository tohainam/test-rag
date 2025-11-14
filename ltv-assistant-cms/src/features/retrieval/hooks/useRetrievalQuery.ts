import { useState } from 'react';
import { retrievalApi, type QueryError, type QueryRequest, type QueryResponse } from '../api';

export interface UseRetrievalQueryResult {
  execute: (request: QueryRequest) => Promise<void>;
  data: QueryResponse | null;
  error: QueryError | null;
  isLoading: boolean;
}

export function useRetrievalQuery(): UseRetrievalQueryResult {
  const [data, setData] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<QueryError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const execute = async (request: QueryRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await retrievalApi.query(request);
      setData(response);
    } catch (err) {
      const queryError: QueryError = {
        statusCode: (err as { response?: { status?: number } }).response?.status || 500,
        message:
          (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Đã xảy ra lỗi khi xử lý truy vấn',
        error: (err as { response?: { data?: { error?: string } } }).response?.data?.error,
      };
      setError(queryError);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    execute,
    data,
    error,
    isLoading,
  };
}
