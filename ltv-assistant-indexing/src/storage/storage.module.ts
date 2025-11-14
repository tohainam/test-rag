import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { storageProviderFactory } from './storage.provider.factory';
import { MimeDetectionService } from './services/mime-detection.service';
import { IntegrityService } from './services/integrity.service';

@Module({
  imports: [ConfigModule],
  providers: [
    storageProviderFactory,
    StorageService,
    MimeDetectionService,
    IntegrityService,
  ],
  exports: [StorageService, MimeDetectionService, IntegrityService],
})
export class StorageModule {}
