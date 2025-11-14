import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import { createPool, Pool } from 'mysql2/promise';
import * as schema from './schema';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (
        configService: ConfigService,
      ): MySql2Database<typeof schema> => {
        const pool: Pool = createPool({
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 3306),
          user: configService.get<string>('DB_USER', 'root'),
          password: configService.get<string>('DB_PASSWORD', 'root'),
          database: configService.get<string>(
            'DB_NAME',
            'ltv_assistant_indexing_db',
          ),
          waitForConnections: true,
          connectionLimit: configService.get<number>('DB_POOL_MAX', 10),
          queueLimit: 0,
          charset: 'utf8mb4', // Support full UTF-8 including emojis and special characters
        });

        return drizzle(pool, { schema, mode: 'default' });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
