export interface StorageConfig {
  endpoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
}

export interface PresignedUrlOptions {
  expirySeconds?: number;
}

export interface MultipartUploadOptions {
  expirySeconds?: number;
}
