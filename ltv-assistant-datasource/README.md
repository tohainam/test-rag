<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

LTV Assistant Datasource Service - Manages file uploads, downloads, and storage operations for the LTV Assistant platform.

## Features

- File upload/download via presigned URLs
- Multipart upload support for large files
- S3-compatible storage (MinIO, AWS S3, DigitalOcean Spaces, etc.)
- Provider-agnostic architecture
- MIME type detection and validation
- File integrity checking
- Document access control

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Storage Configuration

The service uses a provider-agnostic storage layer that works with any S3-compatible storage service.

### Supported Storage Providers

- **MinIO** (default for local development)
- **AWS S3**
- **DigitalOcean Spaces**
- **Linode Object Storage**
- **Wasabi**
- **Any S3-compatible storage**

### Configuration

All storage configuration is done via environment variables:

```bash
# Storage Configuration
STORAGE_PROVIDER_TYPE=s3            # Provider type: s3, azure (future), gcs (future)
STORAGE_ENDPOINT=localhost          # Storage endpoint
STORAGE_PORT=9000                   # Storage port
STORAGE_ACCESS_KEY=minioadmin       # Access key ID
STORAGE_SECRET_KEY=minioadmin       # Secret access key
STORAGE_BUCKET=documents            # Bucket name
STORAGE_USE_SSL=false               # Use HTTPS
STORAGE_REGION=us-east-1            # Region
```

#### Provider Types

- **`s3`** - S3-compatible storage (default)
  - Works with: MinIO, AWS S3, DigitalOcean Spaces, Linode, Wasabi, etc.
  - Uses AWS SDK S3Client

- **`azure`** - Azure Blob Storage (coming soon)
  - Requires Azure Storage implementation

- **`gcs`** - Google Cloud Storage (coming soon)
  - Requires GCS implementation

### Switching Storage Providers

To switch from MinIO to another provider, simply update the environment variables:

#### AWS S3
```bash
STORAGE_PROVIDER_TYPE=s3
STORAGE_ENDPOINT=s3.amazonaws.com
STORAGE_PORT=443
STORAGE_ACCESS_KEY=your-aws-access-key
STORAGE_SECRET_KEY=your-aws-secret-key
STORAGE_BUCKET=your-bucket-name
STORAGE_USE_SSL=true
STORAGE_REGION=us-east-1
```

#### DigitalOcean Spaces
```bash
STORAGE_PROVIDER_TYPE=s3
STORAGE_ENDPOINT=nyc3.digitaloceanspaces.com
STORAGE_PORT=443
STORAGE_ACCESS_KEY=your-spaces-key
STORAGE_SECRET_KEY=your-spaces-secret
STORAGE_BUCKET=your-space-name
STORAGE_USE_SSL=true
STORAGE_REGION=nyc3
```

### Architecture

The storage layer uses a provider pattern with the following components:

- **StorageProvider Interface**: Defines the contract for all storage operations
- **S3StorageProvider**: Implements the provider using AWS SDK S3Client
- **StorageService**: High-level service that wraps the provider
- **MimeDetectionService**: Validates and detects file MIME types
- **IntegrityService**: Calculates and verifies file checksums
- **StorageProviderFactory**: Selects and instantiates the correct provider based on `STORAGE_PROVIDER_TYPE`

This architecture allows you to switch storage providers without any code changes - just update your environment variables.

### Adding New Storage Providers

To add a new storage provider (e.g., Azure Blob Storage, Google Cloud Storage):

1. **Create a new provider class** in `src/storage/providers/`:
   ```typescript
   // azure-storage.provider.ts
   export class AzureStorageProvider implements StorageProvider {
     // Implement all interface methods
   }
   ```

2. **Add the provider type** to the enum in `storage.provider.factory.ts`:
   ```typescript
   export enum StorageProviderType {
     S3 = 's3',
     AZURE = 'azure',  // Add here
   }
   ```

3. **Update the factory switch statement**:
   ```typescript
   case StorageProviderType.AZURE:
     logger.log('Using Azure Blob Storage provider');
     return new AzureStorageProvider(config);
   ```

4. **Set the environment variable**:
   ```bash
   STORAGE_PROVIDER_TYPE=azure
   ```

The `StorageProvider` interface ensures all providers implement the same contract, maintaining compatibility with the rest of the application.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
