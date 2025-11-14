export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
}

export interface UserListItem {
  id: number;
  email: string;
  name: string;
  avatar: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
