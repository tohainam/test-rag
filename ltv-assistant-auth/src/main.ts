import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { User } from './database/schema';
import { initTracer, shutdownTracer } from './shared/tracing/tracer';

// Initialize tracer BEFORE bootstrap
const serviceName = process.env.SERVICE_NAME || 'ltv-assistant-auth';
const tracer = initTracer(serviceName);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);
  const configService = app.get(ConfigService);

  // Enable CORS
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL', 'http://localhost:30000'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Cookie parser middleware
  app.use(cookieParser());

  // Session middleware for passport
  app.use(
    session({
      secret: configService.get<string>('JWT_SECRET') || 'fallback-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
      },
    }),
  );

  // Passport middleware
  app.use(passport.initialize());
  app.use(passport.session());

  // Serialization/deserialization
  passport.serializeUser((user, done) => {
    done(null, (user as User).id);
  });

  passport.deserializeUser((id, done) => {
    // Passport session management - user is already attached to req by guards
    done(null, false);
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Setup TCP microservice
  const tcpPort = configService.get<number>('TCP_PORT', 4001);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  await app.startAllMicroservices();
  logger.log(`📡 TCP microservice is running on port ${tcpPort}`);

  const port = configService.get<number>('PORT', 50051);
  await app.listen(port);
  logger.log(`🚀 Auth service running on: http://localhost:${port}`);
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
