/**
 * User Role Constants
 * These must match the role enum values in the auth service database
 */
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  USER = 'USER',
}

/**
 * Role arrays for common permission patterns
 */
export const ADMIN_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
export const ALL_ROLES = [UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
