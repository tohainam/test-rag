import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { initTracer, shutdownTracer } from './shared/tracing/tracer';

const serviceName = process.env.SERVICE_NAME || 'ltv-assistant-indexing';
const tracer = initTracer(serviceName);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  const configService = app.get(ConfigService);

  // Add TCP microservice for inter-service communication
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: 'localhost',
      port: configService.get<number>('TCP_PORT', 4003),
    },
  });

  await app.startAllMicroservices();
  logger.log(
    `📡 TCP microservice is running on port ${configService.get<number>('TCP_PORT', 4003)}`,
  );

  const port = configService.get<number>('PORT', 50052);
  await app.listen(port);
  logger.log(`🚀 Indexing service is running on http://localhost:${port}`);
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
