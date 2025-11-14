# Load Stage - LTV Assistant Indexing Service

## Overview

The **Load Stage** is the first and foundational stage of the 7-stage indexing pipeline in the LTV Assistant system. It is responsible for fetching files from MinIO object storage, detecting file types, validating integrity, and preparing files for subsequent processing stages.

## Pipeline Position

```
Load → Parse → Structure → Chunk → Enrich → Embed → Persist
  ↑
YOU ARE HERE
```

## Responsibilities

Based on specifications from `/docs/plans/load-stage.md`, the Load Stage handles:

1. **File Retrieval** - Fetch files from MinIO using S3-compatible API
2. **MIME Type Detection** - Detect and validate file types using magic bytes
3. **Large File Handling** - Stream files >50MB to avoid memory overflow
4. **Integrity Verification** - Calculate and verify MD5 checksums
5. **Metadata Enrichment** - Capture file size, MIME type, retrieval timestamp

## Architecture

### Components

```
LoadStage (Orchestrator)
├── MinioService              # S3-compatible file retrieval
├── MimeDetectionService      # Magic byte + extension detection
├── StreamingService          # Buffer vs stream decision logic
└── IntegrityService          # Checksum calculation & verification
```

### Data Flow

```
Input:
  - fileId, documentId, filePath, filename, mimeType

Processing:
  1. Validate input parameters
  2. Fetch file metadata from MinIO
  3. Decide load method (buffer <50MB vs stream >=50MB)
  4. Load file using chosen method
  5. Detect MIME type from magic bytes
  6. Validate file type is supported
  7. Calculate MD5 checksum
  8. Build enriched metadata

Output:
  - buffer (for small files) OR streamPath (for large files)
  - metadata (size, MIME, checksum, retrievedAt, loadMethod)
```

## Supported File Types

| Extension | MIME Type | Parser | Max Size |
|-----------|-----------|--------|----------|
| `.pdf` | application/pdf | PDFLoader | 100MB |
| `.docx` | application/vnd.openxmlformats-officedocument.wordprocessingml.document | DocxLoader | 50MB |
| `.txt` | text/plain | TextLoader | 10MB |
| `.md` | text/markdown | TextLoader | 10MB |
| `.py` | text/x-python | CodeLoader | 5MB |
| `.js`, `.ts` | text/javascript, text/typescript | CodeLoader | 5MB |
| `.java` | text/x-java-source | CodeLoader | 5MB |
| `.cpp`, `.c` | text/x-c++src, text/x-c | CodeLoader | 5MB |

## Error Handling

### Error Classification

The Load Stage implements comprehensive error classification:

#### Permanent Errors (No Retry)
- `FileNotFoundError` - File doesn't exist in MinIO
- `AccessDeniedError` - Insufficient permissions
- `UnsupportedFileTypeError` - MIME type not supported
- `ChecksumMismatchError` - File integrity failure
- `InvalidInputError` - Malformed input parameters

#### Temporary Errors (Retry with Backoff)
- `NetworkTimeoutError` - Request timeout
- `ServiceUnavailableError` - MinIO temporarily down
- `RateLimitExceededError` - Too many requests

#### Resource Errors (Retry with Adaptation)
- `OutOfMemoryError` - Memory exhausted (switch to streaming)
- `DiskFullError` - Temporary storage full

### Retry Strategy

- **Max Attempts:** 3
- **Backoff:** Exponential (5s, 10s, 20s)
- **Fail Fast:** Permanent errors skip retries

## Configuration

### Environment Variables

```bash
# MinIO Configuration
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_REGION=us-east-1
MINIO_BUCKET=documents

# Load Stage Configuration
LOAD_STREAMING_THRESHOLD=50      # Files >50MB will be streamed
LOAD_CHUNK_SIZE=65536             # 64KB chunks for streaming
LOAD_TEMP_DIR=/tmp/indexing       # Temp directory for large files
```

## Usage

### Basic Usage

```typescript
import { LoadStage, LoadInputDto } from './stages/load';

// Inject LoadStage in your service
constructor(private readonly loadStage: LoadStage) {}

// Execute Load Stage
const input: LoadInputDto = {
  fileId: 'file-uuid-123',
  documentId: 'doc-uuid-456',
  filePath: 'documents/my-file.pdf',
  filename: 'my-file.pdf',
  mimeType: 'application/pdf',
};

const output = await this.loadStage.execute(input);

// Access results
console.log('Load Method:', output.metadata.loadMethod); // 'buffer' or 'stream'
console.log('File Size:', output.metadata.size);
console.log('MIME Type:', output.metadata.mimeType);
console.log('Checksum:', output.metadata.checksumMd5);

// For small files
if (output.buffer) {
  // Process buffer directly
  const content = output.buffer.toString('utf-8');
}

// For large files
if (output.streamPath) {
  // Read from temp file
  const fs = await import('fs/promises');
  const content = await fs.readFile(output.streamPath, 'utf-8');

  // Don't forget to cleanup when done
  await fs.unlink(output.streamPath);
}
```

### Integration with IndexingProcessor

```typescript
import { LoadStage, LoadInputDto } from './stages/load';

@Processor('file-indexing')
export class IndexingProcessor extends WorkerHost {
  constructor(
    private readonly loadStage: LoadStage,
  ) {}

  async process(job: Job<FileJobData>): Promise<void> {
    const { fileId, documentId, filePath, filename, mimeType } = job.data;

    // Execute Load Stage
    const loadInput: LoadInputDto = {
      fileId,
      documentId,
      filePath,
      filename,
      mimeType,
    };

    const loadOutput = await this.loadStage.execute(loadInput);

    // Pass to Parse Stage
    // TODO: Implement Parse Stage
  }
}
```

## Performance

### Latency Targets

| File Size | Target Latency | Maximum Latency |
|-----------|---------------|-----------------|
| <1MB | 500ms | 2s |
| 1-10MB | 2s | 5s |
| 10-50MB | 5s | 15s |
| 50-100MB | 15s | 30s |
| 100MB-1GB | 1min | 3min |

### Memory Efficiency

- **Small files (<50MB):** Buffered in memory
- **Large files (>=50MB):** Streamed to temp file
- **Memory usage:** ~10MB buffer regardless of file size when streaming

## Security

### Input Validation

- File path validation (no path traversal)
- File path length limit (1-1024 characters)
- File path pattern: `^[a-zA-Z0-9/_.-]+$`
- UUID format validation for fileId and documentId

### Data Privacy

- No file content logging
- Sanitized file paths in logs
- Secure temporary file storage
- Automatic cleanup of temp files

## Testing

### Unit Tests

Run unit tests:

```bash
npm run test
```

Test coverage includes:
- MinIO service (file retrieval, error handling)
- MIME detection (magic bytes, extension mapping)
- Streaming service (buffer vs stream decision)
- Integrity service (checksum calculation)
- Load Stage orchestrator (full workflow)

### Integration Tests

Run integration tests:

```bash
npm run test:e2e
```

Integration tests verify:
- MinIO connectivity
- Large file streaming
- MIME detection accuracy
- Error handling and retry logic

## Monitoring

### Key Metrics

- **Load duration:** Time taken to load files
- **Load method distribution:** Buffer vs stream ratio
- **Error rate:** Permanent vs temporary errors
- **Retry rate:** How often retries are triggered
- **File size distribution:** Small vs large files

### Logging

All operations are logged with structured context:

```
[LoadStage] === Load Stage Start === File: my-file.pdf (file-uuid-123)
[MinioService] Fetching metadata for file: documents/my-file.pdf
[StreamingService] Load method decision: buffer (File size small enough)
[MimeDetectionService] MIME detection - Type: application/pdf, Confidence: high
[IntegrityService] File checksum (MD5): abc123...
[LoadStage] === Load Stage Complete === Duration: 450ms, Method: buffer, Size: 1234567 bytes
```

## Future Enhancements

The following features are planned for future phases:

1. **Datasource Service Integration** - Fetch file metadata via TCP
2. **Presigned URL Support** - Direct URL-based file access
3. **Caching Layer** - Cache frequently accessed files
4. **Parallel Processing** - Concurrent file loading
5. **Progress Tracking** - Real-time progress updates for large files

## References

- **PRD:** `/docs/plans/load-stage.md`
- **Architecture:** `/docs/system-architecture.md`
- **Code Standards:** `/docs/code-standards.md`

## Support

For questions or issues:
1. Review the specification: `/docs/plans/load-stage.md`
2. Check error logs for detailed error messages
3. Verify MinIO connectivity and credentials
4. Ensure temp directory has sufficient disk space

---

**Status:** ✅ Implemented (Phase 1 Complete)
**Next Stage:** Parse Stage (Coming Soon)
