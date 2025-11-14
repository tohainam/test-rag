/**
 * Gateway Authentication Guard
 * Verifies requests come from API Gateway with proper authentication
 *
 * Security Model:
 * - API Gateway is the trust boundary
 * - Gateway authenticates users via Auth service (JWT)
 * - Gateway injects headers: X-User-Id, X-User-Email, X-User-Role, X-Gateway-Auth
 * - This guard verifies X-Gateway-Auth: verified header
 * - Extracts user context from headers and attaches to request
 *
 * Throws UnauthorizedException if:
 * - X-Gateway-Auth header is missing or not "verified"
 * - Required user headers (X-User-Id, X-User-Email, X-User-Role) are missing
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../interfaces/request.interface';

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Verify X-Gateway-Auth header
    const gatewayAuth = request.headers['x-gateway-auth'];
    if (gatewayAuth !== 'verified') {
      throw new UnauthorizedException(
        'Invalid gateway authentication. Requests must come from API Gateway.',
      );
    }

    // Extract user context from headers
    const userId = request.headers['x-user-id'];
    const userEmail = request.headers['x-user-email'];
    const userRole = request.headers['x-user-role'];

    // Validate required headers
    if (!userId || !userEmail || !userRole) {
      throw new UnauthorizedException(
        'Missing user context headers from gateway.',
      );
    }

    // Parse userId to number
    const userIdNum = parseInt(userId as string, 10);
    if (isNaN(userIdNum)) {
      throw new UnauthorizedException('Invalid user ID format.');
    }

    // Attach user to request
    request.user = {
      userId: userIdNum,
      email: userEmail as string,
      role: userRole as string,
    };

    return true;
  }
}
