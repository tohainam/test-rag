import { apiClient } from '@/shared/api';
import { CreateTokenDto, PersonalToken, TokenCreatedResponse } from '../types';

export const personalTokensApi = {
  // User endpoints
  listTokens: async (): Promise<PersonalToken[]> => {
    const response = await apiClient.get('/personal-tokens');
    return response.data;
  },

  createToken: async (dto: CreateTokenDto): Promise<TokenCreatedResponse> => {
    const response = await apiClient.post('/personal-tokens', dto);
    return response.data;
  },

  revokeToken: async (id: number): Promise<void> => {
    await apiClient.delete(`/personal-tokens/${id}`);
  },

  // Admin endpoints
  listUserTokens: async (userId: number): Promise<PersonalToken[]> => {
    const response = await apiClient.get(`/admin/personal-tokens/user/${userId}`);
    return response.data;
  },

  createTokenForUser: async (
    userId: number,
    dto: CreateTokenDto
  ): Promise<TokenCreatedResponse> => {
    const response = await apiClient.post(`/admin/personal-tokens/user/${userId}`, dto);
    return response.data;
  },

  revokeTokenAsAdmin: async (id: number): Promise<void> => {
    await apiClient.delete(`/admin/personal-tokens/${id}`);
  },
};
