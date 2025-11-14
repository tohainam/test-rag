import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const INDEXING_SERVICE_CLIENT = 'INDEXING_SERVICE_CLIENT';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: INDEXING_SERVICE_CLIENT,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>(
              'INDEXING_SERVICE_HOST',
              'localhost',
            ),
            port: configService.get<number>('INDEXING_SERVICE_TCP_PORT', 4003),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class IndexingTcpClientModule {}
