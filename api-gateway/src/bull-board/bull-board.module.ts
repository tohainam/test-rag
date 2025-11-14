import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    // Connect to Redis for BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    // Register the queue to monitor
    BullModule.registerQueue({
      name: 'file-indexing',
    }),
    // Setup Bull Board UI
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: ExpressAdapter,
    }),
    // Add the queue to Bull Board
    BullBoardModule.forFeature({
      name: 'file-indexing',
      adapter: BullMQAdapter,
    }),
  ],
})
export class BullBoardConfigModule {}
