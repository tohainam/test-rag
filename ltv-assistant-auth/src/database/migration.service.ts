import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { createPool, Pool } from 'mysql2/promise';

@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    // Only run auto-migration in development
    if (nodeEnv === 'development') {
      await this.runMigrations();
    }
  }

  private async runMigrations(): Promise<void> {
    let pool: Pool | null = null;

    try {
      this.logger.log('Running database migrations...');

      pool = createPool({
        host: this.configService.get<string>('DB_HOST', 'localhost'),
        port: this.configService.get<number>('DB_PORT', 3306),
        user: this.configService.get<string>('DB_USER', 'root'),
        password: this.configService.get<string>('DB_PASSWORD', ''),
        database: this.configService.get<string>('DB_NAME', 'ltv_assistant'),
      });

      const db = drizzle(pool);

      await migrate(db, { migrationsFolder: './drizzle' });

      this.logger.log('Database migrations completed successfully');
    } catch (error) {
      this.logger.error('Failed to run migrations', error);
      throw error;
    } finally {
      if (pool) {
        await pool.end();
      }
    }
  }
}
