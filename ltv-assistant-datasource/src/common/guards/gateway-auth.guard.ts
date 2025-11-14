import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../interfaces/request.interface';

/**
 * GatewayAuthGuard
 *
 * This guard ensures that requests come from the API Gateway with valid authentication.
 * It checks for the X-Gateway-Auth header and extracts user information from gateway-injected headers.
 *
 * Security:
 * - Only the API Gateway should be able to set these headers
 * - The gateway strips any spoofed headers from client requests
 * - This creates a trust boundary where services trust the gateway's authentication
 */
@Injectable()
export class GatewayAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Check if request is authenticated by gateway
    const gatewayAuth = request.headers['x-gateway-auth'];
    if (gatewayAuth !== 'verified') {
      throw new UnauthorizedException(
        'Request must be authenticated through API Gateway',
      );
    }

    // Extract user information from gateway-injected headers
    const userId = request.headers['x-user-id'];
    const userEmail = request.headers['x-user-email'];
    const userRole = request.headers['x-user-role'];

    // Validate user context from gateway
    if (
      !userId ||
      !userEmail ||
      !userRole ||
      Array.isArray(userId) ||
      Array.isArray(userEmail) ||
      Array.isArray(userRole)
    ) {
      throw new UnauthorizedException('Missing user context from gateway');
    }

    // Attach user info to request
    request.user = {
      userId: Number.parseInt(userId, 10),
      email: userEmail,
      role: userRole,
    };

    return true;
  }
}
