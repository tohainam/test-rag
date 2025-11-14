import { UserRole, type UserListItem } from '@/entities/user/model';

export { UserRole, type UserListItem };

export interface UsersResponse {
  data: UserListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface GetUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
