export interface ApiErrorResponse {
  response?: {
    data?: {
      message?: string;
      error?: string;
      statusCode?: number;
    };
    status?: number;
  };
  message?: string;
}

export function isApiError(error: unknown): error is ApiErrorResponse {
  return typeof error === 'object' && error !== null && ('response' in error || 'message' in error);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (isApiError(error)) {
    return error.response?.data?.message || error.message || 'An error occurred';
  }

  return 'An unexpected error occurred';
}
