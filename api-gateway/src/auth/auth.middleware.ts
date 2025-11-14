import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AUTH_SERVICE_CLIENT } from './auth-tcp-client.module';
import { PUBLIC_PATHS } from './public-paths.constant';

// Extend Express Request to include user
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      userId: number;
      email: string;
      role: string;
    };
  }
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    @Inject(AUTH_SERVICE_CLIENT)
    private readonly authServiceClient: ClientProxy,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    console.log(
      `[NestJS AuthMiddleware] Path: ${req.path}, isPublic: ${this.isPublicRoute(req.path)}`,
    );
    // Allow auth endpoints to pass through without authentication
    if (this.isPublicRoute(req.path)) {
      console.log(`[NestJS AuthMiddleware] Allowing public path: ${req.path}`);
      return next();
    }

    // Extract token from Authorization header or cookies
    const token = this.extractToken(req);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      // Verify token via Auth Service TCP
      const response = (await firstValueFrom(
        this.authServiceClient.send<{
          success: boolean;
          user?: { userId: number; email: string; role: string };
          error?: string;
        }>({ cmd: 'verify_token' }, { token }),
      )) as {
        success: boolean;
        user?: { userId: number; email: string; role: string };
        error?: string;
      };

      if (!response.success) {
        throw new UnauthorizedException(
          response.error || 'Invalid authentication token',
        );
      }

      if (!response.user) {
        throw new UnauthorizedException('User data not found');
      }

      // Attach user info to request
      req.user = {
        userId: response.user.userId,
        email: response.user.email,
        role: response.user.role,
      };

      // Inject user context as headers for downstream services
      req.headers['x-gateway-auth'] = 'verified';
      req.headers['x-user-id'] = String(response.user.userId);
      req.headers['x-user-email'] = response.user.email;
      req.headers['x-user-role'] = response.user.role;

      next();
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      console.error('[AuthMiddleware] Token verification failed:', error);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractToken(req: Request): string | null {
    // Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookies
    if (req.cookies && req.cookies.access_token) {
      return req.cookies.access_token as string;
    }

    return null;
  }

  private isPublicRoute(path: string): boolean {
    return PUBLIC_PATHS.some((publicPath) => path.startsWith(publicPath));
  }
}
