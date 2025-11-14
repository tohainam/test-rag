/**
 * Roles Guard
 * Enforces role-based access control for endpoints
 *
 * Usage:
 * @Roles(UserRole.SUPER_ADMIN)
 * @UseGuards(GatewayAuthGuard, RolesGuard)
 * @Get('/admin-endpoint')
 * async adminOnly() { ... }
 *
 * Note: Must be used after GatewayAuthGuard to ensure user is attached to request
 */

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../interfaces/request.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles specified, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    // User should be attached by GatewayAuthGuard
    if (!user) {
      return false;
    }

    // Check if user's role is in required roles
    return requiredRoles.includes(user.role);
  }
}
