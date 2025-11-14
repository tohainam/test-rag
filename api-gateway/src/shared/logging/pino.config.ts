import { Params } from 'nestjs-pino';
import { Request } from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { multistream } from 'pino';
import pinoPretty from 'pino-pretty';
import { createWriteStream } from 'fs';
import { join } from 'path';

interface RequestWithId extends Request {
  id: string;
}

const serviceName = process.env.SERVICE_NAME || 'api-gateway';
const logDir =
  process.env.LOG_DIR || '/Users/tohainam/Desktop/work/ltv-assistant/logs';

export const pinoConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL || 'info',

    base: {
      service: serviceName,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '1.0.0',
    },

    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'password',
        'accessToken',
        'refreshToken',
        'token',
      ],
      remove: true,
    },

    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,

    serializers: {
      req: (req: IncomingMessage) => {
        const request = req as RequestWithId;
        return {
          id: request.id,
          method: request.method,
          url: request.url,
          headers:
            process.env.NODE_ENV === 'production' ? undefined : request.headers,
        };
      },
      res: (res: ServerResponse) => ({
        statusCode: res.statusCode,
      }),
    },

    autoLogging: {
      ignore: (req: IncomingMessage) => {
        const url = req.url || '';
        return (
          url === '/health' || url === '/metrics' || url.startsWith('/_next')
        );
      },
    },

    genReqId: (req: IncomingMessage) => {
      const request = req as RequestWithId;
      const requestId = req.headers['x-request-id'];
      return typeof requestId === 'string' ? requestId : request.id;
    },

    customProps: (req: IncomingMessage) => {
      const request = req as RequestWithId;
      const requestId = req.headers['x-request-id'];
      const traceId = req.headers['x-trace-id'];
      const userId = req.headers['x-user-id'];
      const userEmail = req.headers['x-user-email'];

      return {
        requestId: typeof requestId === 'string' ? requestId : request.id,
        traceId: typeof traceId === 'string' ? traceId : undefined,
        userId: typeof userId === 'string' ? userId : undefined,
        userEmail: typeof userEmail === 'string' ? userEmail : undefined,
      };
    },

    // Write logs to both console (pretty) and file (JSON)
    stream: multistream([
      // Console output with pretty formatting
      {
        level: 'info',
        stream:
          process.env.NODE_ENV !== 'production'
            ? pinoPretty({
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
                singleLine: false,
              })
            : process.stdout,
      },
      // File output with JSON formatting (for Loki/Promtail)
      {
        level: 'debug',
        stream: createWriteStream(join(logDir, `${serviceName}.log`), {
          flags: 'a',
        }),
      },
    ]),
  },
};
