export interface FileMetadata {
  contentLength: number;
  contentType: string | null;
  etag: string | null;
  lastModified: Date | null;
}

export interface MultipartUploadPart {
  partNumber: number;
  etag: string;
}

export interface MultipartUploadInit {
  uploadId: string;
  key: string;
}

export interface MultipartUploadUrls {
  partNumber: number;
  url: string;
}
