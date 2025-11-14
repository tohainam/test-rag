import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import * as schema from './schema';
import { MigrationService } from './migration.service';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (configService: ConfigService) => {
        const pool = createPool({
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT', 3306),
          user: configService.get<string>('DB_USER'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_NAME'),
        });

        return drizzle(pool, { schema, mode: 'default' });
      },
      inject: [ConfigService],
    },
    MigrationService,
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
