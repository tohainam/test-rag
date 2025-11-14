/**
 * Roles Decorator
 * Sets metadata for role-based access control
 *
 * Usage:
 * @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
 * @UseGuards(GatewayAuthGuard, RolesGuard)
 * @Get('/admin-only')
 * async adminEndpoint() {
 *   // Only SUPER_ADMIN and ADMIN can access
 * }
 */

import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
