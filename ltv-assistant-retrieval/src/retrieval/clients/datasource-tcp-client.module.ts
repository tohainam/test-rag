/**
 * Datasource TCP Client Module
 * Provides TCP client connection to ltv-assistant-datasource service
 */

import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'DATASOURCE_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>(
              'DATASOURCE_SERVICE_HOST',
              'localhost',
            ),
            port: configService.get<number>(
              'DATASOURCE_SERVICE_TCP_PORT',
              4004,
            ),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class DatasourceTcpClientModule {}
