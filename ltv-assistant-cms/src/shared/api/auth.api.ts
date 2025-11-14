import { UserRole } from '@/entities/user/model';
import apiClient from './axios';

export interface User {
  id: number;
  email: string;
  name: string;
  avatar: string | null;
  role: UserRole;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:50051';

export const authApi = {
  // Redirect to Google OAuth
  loginWithGoogle: () => {
    window.location.href = `${API_URL}/auth/google`;
  },

  // Refresh access token
  refreshToken: async (): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/refresh');
    return response.data;
  },

  // Logout
  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  // Get current user
  getCurrentUser: async (): Promise<{ user: User }> => {
    const response = await apiClient.get<{ user: User }>('/auth/me');
    return response.data;
  },
};
