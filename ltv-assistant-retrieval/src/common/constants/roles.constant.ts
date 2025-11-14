/**
 * User Role Constants
 * Defines role-based access control levels
 */

export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];
