import { Module, Global, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import * as schema from './schema';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const connection = mysql.createPool({
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 3306),
          user: configService.get<string>('DB_USER', 'root'),
          password: configService.get<string>('DB_PASSWORD', 'root'),
          database: configService.get<string>('DB_NAME', 'ltv_indexing_db'),
          connectionLimit: configService.get<number>('DB_POOL_MAX', 10),
          waitForConnections: true,
          queueLimit: 0,
        });

        return drizzle(connection, { schema, mode: 'default' });
      },
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule implements OnModuleInit {
  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    console.log(`Database connection initialized for ${nodeEnv} environment`);
    console.log(
      `Database: ${this.configService.get<string>('DB_NAME', 'ltv_indexing_db')}`,
    );
  }
}
