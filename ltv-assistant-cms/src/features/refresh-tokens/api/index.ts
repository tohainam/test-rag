import { apiClient } from '@/shared/api';
import { RefreshToken } from '../types';

export const refreshTokensApi = {
  // Admin endpoints
  listUserRefreshTokens: async (userId: number): Promise<RefreshToken[]> => {
    const response = await apiClient.get(`/admin/refresh-tokens/user/${userId}`);
    return response.data;
  },

  revokeRefreshToken: async (id: number): Promise<void> => {
    await apiClient.delete(`/admin/refresh-tokens/${id}`);
  },
};
