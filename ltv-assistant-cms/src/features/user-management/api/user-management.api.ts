import { UserRole } from '@/entities/user/model';
import apiClient from '@/shared/api/axios';
import type { GetUsersParams, UserListItem, UsersResponse } from '../model/types';

export const userManagementApi = {
  getUsers: async (params: GetUsersParams): Promise<UsersResponse> => {
    const response = await apiClient.get<UsersResponse>('/users', { params });
    return response.data;
  },

  searchUsers: async (query: string): Promise<UserListItem[]> => {
    const response = await apiClient.get<UserListItem[]>('/users/search', { params: { q: query } });
    return response.data;
  },

  updateUserRole: async (userId: number, role: UserRole): Promise<UserListItem> => {
    const response = await apiClient.patch<UserListItem>(`/users/${userId}/role`, { role });
    return response.data;
  },
};
