import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cookieParser from 'cookie-parser';
import { Transport } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { Response, NextFunction } from 'express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AuthenticatedRequest } from './types/express';
import { PUBLIC_PATHS } from './auth/public-paths.constant';
import { initTracer, shutdownTracer } from './shared/tracing/tracer';

// Initialize tracer BEFORE bootstrap
const serviceName = process.env.SERVICE_NAME || 'api-gateway';
const tracer = initTracer(serviceName);

interface VerifyTokenResponse {
  success: boolean;
  user?: {
    userId: number;
    email: string;
    role: string;
  };
  error?: string;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);
  const configService = app.get(ConfigService);

  const { ClientProxyFactory } = await import('@nestjs/microservices');
  const authServiceClient = ClientProxyFactory.create({
    transport: Transport.TCP,
    options: {
      host: configService.get<string>('AUTH_SERVICE_HOST', 'localhost'),
      port: configService.get<number>('AUTH_SERVICE_TCP_PORT', 4001),
    },
  });

  app.use(cookieParser());

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });

  app.use(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      logger.log(`[Express Auth Middleware] Path: ${req.path}`);
      const isPublicRoute = PUBLIC_PATHS.some((path) =>
        req.path.startsWith(path),
      );

      logger.log(
        `[Express Auth Middleware] isPublicRoute: ${isPublicRoute}, PUBLIC_PATHS: ${JSON.stringify(PUBLIC_PATHS)}`,
      );

      if (isPublicRoute) {
        logger.log(
          `[Express Auth Middleware] Allowing public path: ${req.path}`,
        );
        return next();
      }

      let token: string | null = null;
      const authHeader = req.headers.authorization;
      if (
        authHeader &&
        typeof authHeader === 'string' &&
        authHeader.startsWith('Bearer ')
      ) {
        token = authHeader.substring(7);
      } else if (req.cookies && req.cookies.access_token) {
        token = req.cookies.access_token as string;
      }

      if (!token) {
        return res.status(401).json({
          statusCode: 401,
          message: 'No authentication token provided',
          error: 'Unauthorized',
        });
      }

      try {
        const response = await firstValueFrom(
          authServiceClient.send<VerifyTokenResponse>(
            { cmd: 'verify_token' },
            { token },
          ),
        );

        if (!response.success) {
          return res.status(401).json({
            statusCode: 401,
            message: response.error || 'Invalid authentication token',
            error: 'Unauthorized',
          });
        }

        if (!response.user) {
          return res.status(401).json({
            statusCode: 401,
            message: 'User data not found',
            error: 'Unauthorized',
          });
        }

        req.user = {
          userId: response.user.userId,
          email: response.user.email,
          role: response.user.role,
        };

        next();
      } catch (error) {
        const requestId = (req as AuthenticatedRequest & { requestId?: string })
          .requestId;
        logger.error(
          {
            error: {
              name: error instanceof Error ? error.name : 'Error',
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
            requestId,
          },
          'Authentication error',
        );
        return res.status(401).json({
          statusCode: 401,
          message: 'Authentication failed',
          error: 'Unauthorized',
        });
      }
    },
  );

  const authServiceUrl = configService.get<string>('AUTH_SERVICE_URL');
  const datasourceServiceUrl = configService.get<string>(
    'DATASOURCE_SERVICE_URL',
  );
  const retrievalServiceUrl = configService.get<string>(
    'RETRIEVAL_SERVICE_URL',
  );

  const authProxy = createProxyMiddleware({
    target: authServiceUrl,
    changeOrigin: true,
    cookieDomainRewrite: '',
    pathFilter: [
      '/auth/**',
      '/users/**',
      '/personal-tokens/**',
      '/admin/personal-tokens/**',
      '/admin/refresh-tokens/**',
    ],
    on: {
      proxyReq: (proxyReq, req: AuthenticatedRequest) => {
        const requestId = (req as AuthenticatedRequest & { requestId?: string })
          .requestId;
        logger.debug(
          {
            requestId,
            userId: req.user?.userId,
            context: {
              method: req.method,
              url: req.url,
              target: `${authServiceUrl}${req.url}`,
            },
          },
          'Proxying request to auth service',
        );

        proxyReq.removeHeader('x-gateway-auth');
        proxyReq.removeHeader('x-user-id');
        proxyReq.removeHeader('x-user-email');
        proxyReq.removeHeader('x-user-role');

        const clientIp =
          req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (clientIp) {
          proxyReq.setHeader(
            'X-Forwarded-For',
            typeof clientIp === 'string' ? clientIp : clientIp.toString(),
          );
        }

        const userAgent = req.headers['user-agent'];
        if (userAgent && typeof userAgent === 'string') {
          proxyReq.setHeader('User-Agent', userAgent);
        }

        if (req.user) {
          proxyReq.setHeader('X-Gateway-Auth', 'verified');
          proxyReq.setHeader('X-User-Id', String(req.user.userId));
          proxyReq.setHeader('X-User-Email', req.user.email);
          proxyReq.setHeader('X-User-Role', req.user.role);
        }
      },
      error: (err, _req, res: Response) => {
        const requestId = (
          _req as AuthenticatedRequest & { requestId?: string }
        ).requestId;
        logger.error(
          {
            error: {
              name: err instanceof Error ? err.name : 'Error',
              message: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            },
            requestId,
            context: {
              service: 'auth',
            },
          },
          'Proxy error',
        );
        res.status(503).json({
          statusCode: 503,
          message: 'Auth service temporarily unavailable',
        });
      },
    },
  });

  app.use(authProxy);

  const datasourceProxy = createProxyMiddleware({
    target: datasourceServiceUrl,
    changeOrigin: true,
    cookieDomainRewrite: '',
    pathFilter: ['/documents/**', '/files/**'],
    on: {
      proxyReq: (proxyReq, req: AuthenticatedRequest) => {
        const requestId = (req as AuthenticatedRequest & { requestId?: string })
          .requestId;
        logger.debug(
          {
            requestId,
            userId: req.user?.userId,
            context: {
              method: req.method,
              url: req.url,
              target: `${datasourceServiceUrl}${req.url}`,
            },
          },
          'Proxying request to datasource service',
        );

        proxyReq.removeHeader('x-gateway-auth');
        proxyReq.removeHeader('x-user-id');
        proxyReq.removeHeader('x-user-email');
        proxyReq.removeHeader('x-user-role');

        const clientIp =
          req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (clientIp) {
          proxyReq.setHeader(
            'X-Forwarded-For',
            typeof clientIp === 'string' ? clientIp : clientIp.toString(),
          );
        }

        if (req.user) {
          proxyReq.setHeader('X-Gateway-Auth', 'verified');
          proxyReq.setHeader('X-User-Id', String(req.user.userId));
          proxyReq.setHeader('X-User-Email', req.user.email);
          proxyReq.setHeader('X-User-Role', req.user.role);
        }
      },
      error: (err, _req, res: Response) => {
        const requestId = (
          _req as AuthenticatedRequest & { requestId?: string }
        ).requestId;
        logger.error(
          {
            error: {
              name: err instanceof Error ? err.name : 'Error',
              message: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            },
            requestId,
            context: {
              service: 'datasource',
            },
          },
          'Proxy error',
        );
        res.status(503).json({
          statusCode: 503,
          message: 'Datasource service temporarily unavailable',
        });
      },
    },
  });

  app.use(datasourceProxy);

  const retrievalProxy = createProxyMiddleware({
    target: retrievalServiceUrl,
    changeOrigin: true,
    cookieDomainRewrite: '',
    pathFilter: ['/query/**'],
    on: {
      proxyReq: (proxyReq, req: AuthenticatedRequest) => {
        const requestId = (req as AuthenticatedRequest & { requestId?: string })
          .requestId;
        logger.debug(
          {
            requestId,
            userId: req.user?.userId,
            context: {
              method: req.method,
              url: req.url,
              target: `${retrievalServiceUrl}${req.url}`,
            },
          },
          'Proxying request to retrieval service',
        );

        proxyReq.removeHeader('x-gateway-auth');
        proxyReq.removeHeader('x-user-id');
        proxyReq.removeHeader('x-user-email');
        proxyReq.removeHeader('x-user-role');

        const clientIp =
          req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (clientIp) {
          proxyReq.setHeader(
            'X-Forwarded-For',
            typeof clientIp === 'string' ? clientIp : clientIp.toString(),
          );
        }

        if (req.user) {
          proxyReq.setHeader('X-Gateway-Auth', 'verified');
          proxyReq.setHeader('X-User-Id', String(req.user.userId));
          proxyReq.setHeader('X-User-Email', req.user.email);
          proxyReq.setHeader('X-User-Role', req.user.role);
        }
      },
      error: (err, _req, res: Response) => {
        const requestId = (
          _req as AuthenticatedRequest & { requestId?: string }
        ).requestId;
        logger.error(
          {
            error: {
              name: err instanceof Error ? err.name : 'Error',
              message: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            },
            requestId,
            context: {
              service: 'retrieval',
            },
          },
          'Proxy error',
        );
        res.status(503).json({
          statusCode: 503,
          message: 'Retrieval service temporarily unavailable',
        });
      },
    },
  });

  app.use(retrievalProxy);

  const evaluationServiceUrl = configService.get<string>(
    'EVALUATION_SERVICE_URL',
    'http://ltv-ragas-evaluation:50059',
  );

  const evaluationProxy = createProxyMiddleware({
    target: evaluationServiceUrl,
    changeOrigin: true,
    cookieDomainRewrite: '',
    pathFilter: ['/evaluation/**'],
    on: {
      proxyReq: (proxyReq, req: AuthenticatedRequest) => {
        const requestId = (req as AuthenticatedRequest & { requestId?: string })
          .requestId;

        // Super admin role check
        if (req.user?.role !== 'SUPER_ADMIN') {
          logger.warn(
            {
              requestId,
              userId: req.user?.userId,
              userRole: req.user?.role,
              context: {
                path: req.path,
              },
            },
            'Forbidden: SUPER_ADMIN role required for evaluation endpoint',
          );
          throw new Error('Forbidden: SUPER_ADMIN role required');
        }

        logger.debug(
          {
            requestId,
            userId: req.user?.userId,
            context: {
              method: req.method,
              url: req.url,
              target: `${evaluationServiceUrl}${req.url}`,
            },
          },
          'Proxying request to evaluation service',
        );

        proxyReq.removeHeader('x-gateway-auth');
        proxyReq.removeHeader('x-user-id');
        proxyReq.removeHeader('x-user-email');
        proxyReq.removeHeader('x-user-role');

        const clientIp =
          req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (clientIp) {
          proxyReq.setHeader(
            'X-Forwarded-For',
            typeof clientIp === 'string' ? clientIp : clientIp.toString(),
          );
        }

        if (req.user) {
          proxyReq.setHeader('X-Gateway-Auth', 'verified');
          proxyReq.setHeader('X-User-Id', String(req.user.userId));
          proxyReq.setHeader('X-User-Email', req.user.email);
          proxyReq.setHeader('X-User-Role', req.user.role);
        }
      },
      error: (err, _req, res: Response) => {
        const requestId = (
          _req as AuthenticatedRequest & { requestId?: string }
        ).requestId;

        // Handle forbidden errors
        if (err.message.includes('Forbidden')) {
          return res.status(403).json({
            statusCode: 403,
            message: 'Access denied. Super admin role required.',
          });
        }

        logger.error(
          {
            error: {
              name: err instanceof Error ? err.name : 'Error',
              message: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            },
            requestId,
            context: {
              service: 'evaluation',
            },
          },
          'Proxy error',
        );
        res.status(503).json({
          statusCode: 503,
          message: 'Evaluation service temporarily unavailable',
        });
      },
    },
  });

  app.use(evaluationProxy);

  const port = configService.get<number>('PORT', 50050);
  await app.listen(port);
  logger.log(`🚀 API Gateway is running on: http://localhost:${port}`);
}

void bootstrap();

// Graceful shutdown
process.on('SIGTERM', () => {
  void (async () => {
    console.log('SIGTERM signal received: closing HTTP server');
    await shutdownTracer(tracer);
    process.exit(0);
  })();
});

process.on('SIGINT', () => {
  void (async () => {
    console.log('SIGINT signal received: closing HTTP server');
    await shutdownTracer(tracer);
    process.exit(0);
  })();
});
