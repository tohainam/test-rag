/**
 * Current User Decorator
 * Extracts authenticated user from request context
 *
 * Usage:
 * @Post()
 * async query(@CurrentUser() user: CurrentUserData) {
 *   // user contains { userId: string, email: string, role: string }
 * }
 *
 * Note: User ID is converted to string for consistency across services
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../interfaces/request.interface';

export interface CurrentUserData {
  userId: string; // Converted to string for consistency
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new Error('User not found in request. GatewayAuthGuard required.');
    }

    return {
      userId: request.user.userId.toString(),
      email: request.user.email,
      role: request.user.role,
    };
  },
);
