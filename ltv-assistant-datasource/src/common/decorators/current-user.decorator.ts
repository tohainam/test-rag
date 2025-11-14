import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from '../interfaces/request.interface';

export interface CurrentUserData {
  userId: string;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    // User info is injected by GatewayAuthGuard from gateway headers
    // Convert userId from number to string for database compatibility
    if (!request.user) {
      throw new Error('User not found in request context');
    }
    return {
      email: request.user.email,
      role: request.user.role,
      userId: String(request.user.userId),
    };
  },
);
