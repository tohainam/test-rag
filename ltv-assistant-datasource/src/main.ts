import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { initTracer, shutdownTracer } from './shared/tracing/tracer';

const serviceName = process.env.SERVICE_NAME || 'ltv-assistant-datasource';
const tracer = initTracer(serviceName);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  // Enable CORS
  app.enableCors({
    origin: true, // Allow all origins in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });

  // Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Setup TCP microservice
  const tcpPort = process.env.TCP_PORT || 4004;
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: Number(tcpPort),
    },
  });

  await app.startAllMicroservices();
  logger.log(`📡 TCP microservice is running on port ${tcpPort}`);

  const port = process.env.PORT || 50054;
  await app.listen(port);
  logger.log(`🚀 Datasource service is running on http://localhost:${port}`);
}

void bootstrap();

process.on('SIGTERM', () => {
  void (async () => {
    await shutdownTracer(tracer);
    process.exit(0);
  })();
});

process.on('SIGINT', () => {
  void (async () => {
    await shutdownTracer(tracer);
    process.exit(0);
  })();
});
