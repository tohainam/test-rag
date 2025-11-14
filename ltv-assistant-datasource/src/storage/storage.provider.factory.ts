import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { S3StorageProvider } from './providers';
import { StorageConfig } from './interfaces';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export enum StorageProviderType {
  S3 = 's3',
  // Future providers can be added here:
  // AZURE = 'azure',
  // GCS = 'gcs',
  // LOCAL = 'local',
}

export const storageProviderFactory = {
  provide: STORAGE_PROVIDER,
  useFactory: (configService: ConfigService) => {
    const logger = new Logger('StorageProviderFactory');

    // Get provider type from environment
    const providerType = configService
      .get<string>('STORAGE_PROVIDER_TYPE', StorageProviderType.S3)
      .toLowerCase();

    // Build storage configuration
    const config: StorageConfig = {
      endpoint: configService.get<string>('STORAGE_ENDPOINT', 'localhost'),
      port: configService.get<number>('STORAGE_PORT', 9000),
      accessKey: configService.get<string>('STORAGE_ACCESS_KEY', 'minioadmin'),
      secretKey: configService.get<string>('STORAGE_SECRET_KEY', 'minioadmin'),
      useSSL: configService.get<string>('STORAGE_USE_SSL', 'false') === 'true',
      region: configService.get<string>('STORAGE_REGION', 'us-east-1'),
      bucket: configService.get<string>('STORAGE_BUCKET', 'documents'),
      forcePathStyle:
        configService.get<string>('STORAGE_FORCE_PATH_STYLE', 'true') ===
        'true',
    };

    // Select and instantiate provider based on type
    switch (providerType as StorageProviderType) {
      case StorageProviderType.S3:
        logger.log('Using S3-compatible storage provider');
        return new S3StorageProvider(config);

      // Future providers can be added here:
      // case StorageProviderType.AZURE:
      //   logger.log('Using Azure Blob Storage provider');
      //   return new AzureStorageProvider(config);
      //
      // case StorageProviderType.GCS:
      //   logger.log('Using Google Cloud Storage provider');
      //   return new GcsStorageProvider(config);

      default:
        logger.warn(
          `Unknown storage provider type: ${providerType}. Falling back to S3.`,
        );
        return new S3StorageProvider(config);
    }
  },
  inject: [ConfigService],
};
