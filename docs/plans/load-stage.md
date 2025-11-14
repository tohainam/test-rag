# Kế Hoạch Triển Khai Load Stage

**Phiên bản:** 1.0
**Cập nhật lần cuối:** 2025-11-03
**Trạng thái:** Nháp
**Giai đoạn:** 1/7 (Load)

---

## Mục lục

1. [Tổng quan](#tổng-quan)
2. [Yêu cầu nghiệp vụ](#yêu-cầu-nghiệp-vụ)
3. [Đặc tả chức năng](#đặc-tả-chức-năng)
4. [Phương pháp kỹ thuật](#phương-pháp-kỹ-thuật)
5. [Điểm tích hợp](#điểm-tích-hợp)
6. [Luồng dữ liệu](#luồng-dữ-liệu)
7. [Chiến lược xử lý lỗi](#chiến-lược-xử-lý-lỗi)
8. [Xác thực & Bảo mật](#xác-thực--bảo-mật)
9. [Yêu cầu hiệu năng](#yêu-cầu-hiệu-năng)
10. [Chiến lược kiểm thử](#chiến-lược-kiểm-thử)
11. [Tiêu chí thành công](#tiêu-chí-thành-công)
12. [Các giai đoạn triển khai](#các-giai-đoạn-triển-khai)
13. [Phụ thuộc & Rủi ro](#phụ-thuộc--rủi-ro)

---

## Tổng quan

### Mục đích

Load Stage là giai đoạn đầu tiên và nền tảng của pipeline indexing. Trách nhiệm chính của giai đoạn này là lấy file tài liệu từ MinIO object storage và chuẩn bị cho các giai đoạn xử lý tiếp theo. Giai đoạn này hoạt động như điểm vào của toàn bộ workflow indexing.

### Phạm vi

**Trong phạm vi:**
- Lấy file từ MinIO sử dụng S3-compatible API
- Xác thực và làm giàu metadata file
- Phát hiện và xác minh MIME type
- Hỗ trợ streaming cho file lớn
- Logic retry cho lỗi tạm thời
- Tích hợp với datasource service để lấy metadata file

**Ngoài phạm vi:**
- Phân tích nội dung file (xử lý bởi Parse stage)
- Chuyển đổi định dạng file
- Nén/giải nén file
- Mã hóa/giải mã file (giả định được xử lý ở storage level)
- OCR hoặc xử lý hình ảnh

### Giá trị nghiệp vụ

1. **Độ tin cậy:** Đảm bảo lấy file nhất quán với nhiều kích thước và loại file khác nhau
2. **Hiệu năng:** Cho phép xử lý file lớn một cách hiệu quả thông qua streaming
3. **Khả năng phục hồi:** Cung cấp xử lý lỗi mạnh mẽ cho network và storage failures
4. **Tính truy vết:** Ghi lại metadata file cho audit và debugging
5. **Khả năng mở rộng:** Hỗ trợ tải file đồng thời cho nhiều indexing jobs

---

## Yêu cầu nghiệp vụ

### YN-1: Hỗ trợ lấy file

**Ưu tiên:** P0 (Quan trọng)

**Mô tả:** Hệ thống phải lấy file từ MinIO object storage sử dụng cả presigned URL và đường dẫn S3 trực tiếp.

**Tiêu chí chấp nhận:**
- Hỗ trợ lấy file qua MinIO presigned URLs
- Hỗ trợ lấy file qua đường dẫn S3-compatible (bucket/key)
- Xử lý file lên đến 100MB cho single uploads
- Xử lý file lên đến 5GB cho multipart uploads
- Duy trì tính toàn vẹn file trong quá trình lấy

**Tác động nghiệp vụ:**
- Cho phép tích hợp linh hoạt với datasource service
- Hỗ trợ nhiều phương thức upload từ CMS
- Đảm bảo tính toàn vẹn dữ liệu cho xử lý downstream

---

### YN-2: Phát hiện loại file

**Ưu tiên:** P0 (Quan trọng)

**Mô tả:** Hệ thống phải phát hiện và xác thực chính xác loại file để đảm bảo chỉ các định dạng được hỗ trợ mới được chuyển sang parsing.

**Tiêu chí chấp nhận:**
- Phát hiện MIME type từ file headers (magic bytes)
- Xác thực với danh sách định dạng được hỗ trợ (PDF, DOCX, TXT, MD, Code)
- Xác minh chéo MIME type với file extension
- Từ chối sớm các loại file không được hỗ trợ với thông báo lỗi rõ ràng

**Tác động nghiệp vụ:**
- Ngăn chặn xử lý các file không tương thích
- Giảm lãng phí tài nguyên cho các định dạng không được hỗ trợ
- Cung cấp phản hồi rõ ràng cho người dùng về khả năng tương thích file

---

### YN-3: Xử lý file lớn

**Ưu tiên:** P0 (Quan trọng)

**Mô tả:** Hệ thống phải xử lý file lớn một cách hiệu quả mà không gây tràn bộ nhớ hoặc làm giảm hiệu năng dịch vụ.

**Tiêu chí chấp nhận:**
- Stream file lớn hơn 50MB thay vì load vào memory
- Giám sát việc sử dụng memory trong quá trình load file
- Hỗ trợ chuyển file dần dần với khả năng resume
- Triển khai cơ chế backpressure cho file rất lớn

**Tác động nghiệp vụ:**
- Cho phép indexing các bộ tài liệu toàn diện
- Ngăn chặn service crashes do upload file lớn
- Duy trì service availability cho concurrent users

**Phương pháp kỹ thuật - Streaming:**

**Tại sao cần streaming:**
- **Hạn chế bộ nhớ:** Loading file 1GB vào RAM sẽ tiêu tốn 1GB+ memory
- **Concurrent jobs:** 5 concurrent jobs với file 500MB = 2.5GB+ memory usage
- **Service stability:** Ngăn OOM (Out of Memory) errors

**Khi nào sử dụng streaming:**
```typescript
interface LoadDecision {
  method: 'buffer' | 'stream';
  reason: string;
}

function decideLoadMethod(fileSize: number, availableMemory: number): LoadDecision {
  // Ngưỡng cứng: File > 50MB bắt buộc stream
  if (fileSize > 50 * 1024 * 1024) {
    return { method: 'stream', reason: 'File size exceeds 50MB threshold' };
  }

  // Kiểm tra memory available: Cần ít nhất 2x file size
  if (availableMemory < fileSize * 2) {
    return { method: 'stream', reason: 'Insufficient memory available' };
  }

  // File nhỏ, memory đủ -> buffer vào RAM
  return { method: 'buffer', reason: 'File size small enough for buffering' };
}
```

**Triển khai Streaming:**
```typescript
interface StreamConfig {
  chunkSize: number;        // Default: 64KB
  highWaterMark: number;    // Default: 16 chunks
  tempDir: string;          // Default: /tmp/indexing/{jobId}
}

async function loadFileWithStream(
  filePath: string,
  config: StreamConfig
): Promise<StreamResult> {
  // 1. Tạo thư mục tạm
  const tempFile = path.join(config.tempDir, `${uuid()}.tmp`);
  await fs.mkdir(config.tempDir, { recursive: true });

  // 2. Khởi tạo MinIO stream
  const minioStream = await minioClient.getObject(bucket, filePath);

  // 3. Pipe vào file system với backpressure
  const writeStream = fs.createWriteStream(tempFile, {
    highWaterMark: config.highWaterMark * config.chunkSize,
  });

  // 4. Theo dõi tiến độ
  let bytesReceived = 0;
  minioStream.on('data', (chunk) => {
    bytesReceived += chunk.length;
    logger.debug(`Downloaded ${bytesReceived} bytes`);
  });

  // 5. Xử lý lỗi và cleanup
  const cleanup = async () => {
    try {
      await fs.unlink(tempFile);
    } catch (err) {
      logger.warn('Failed to cleanup temp file:', err);
    }
  };

  return new Promise((resolve, reject) => {
    minioStream
      .pipe(writeStream)
      .on('finish', () => {
        resolve({
          type: 'stream',
          tempPath: tempFile,
          size: bytesReceived,
          cleanup, // Gọi sau khi Parse stage hoàn thành
        });
      })
      .on('error', async (err) => {
        await cleanup();
        reject(err);
      });
  });
}
```

**Ưu điểm Streaming:**
- ✅ Memory usage cố định (~10MB buffer) bất kể file size
- ✅ Có thể xử lý file multi-GB
- ✅ Backpressure tự động ngăn buffer overflow
- ✅ Progress tracking dễ dàng

**Nhược điểm Streaming:**
- ❌ Cần disk space cho temporary files
- ❌ Thêm I/O overhead (read from disk cho Parse stage)
- ❌ Cần cleanup logic cho temp files

**Buffering (File nhỏ):**
```typescript
async function loadFileWithBuffer(filePath: string): Promise<BufferResult> {
  // Load trực tiếp vào memory cho file nhỏ
  const stream = await minioClient.getObject(bucket, filePath);
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);

  return {
    type: 'buffer',
    buffer,
    size: buffer.length,
  };
}
```

**Cleanup Strategy:**
```typescript
// Sau khi Parse stage hoàn thành hoặc lỗi
async function cleanupTempFiles(jobId: string): Promise<void> {
  const tempDir = `/tmp/indexing/${jobId}`;

  try {
    await fs.rm(tempDir, { recursive: true, force: true });
    logger.info(`Cleaned up temp directory: ${tempDir}`);
  } catch (err) {
    logger.error('Cleanup failed:', err);
    // Không throw - cleanup không được làm fail job
  }
}

// Auto cleanup cho orphaned files
async function scheduleCleanup(): Promise<void> {
  // Xóa temp files cũ hơn 24 giờ
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const tempRoot = '/tmp/indexing';

  const dirs = await fs.readdir(tempRoot);
  for (const dir of dirs) {
    const stat = await fs.stat(path.join(tempRoot, dir));
    if (stat.mtime.getTime() < cutoff) {
      await fs.rm(path.join(tempRoot, dir), { recursive: true });
      logger.info(`Auto-cleaned old temp dir: ${dir}`);
    }
  }
}
```

---

### YN-4: Làm giàu metadata

**Ưu tiên:** P1 (Cao)

**Mô tả:** Hệ thống phải ghi lại và làm giàu metadata file để hỗ trợ xử lý downstream và yêu cầu audit.

**Tiêu chí chấp nhận:**
- Ghi lại file size, MIME type, filename gốc
- Ghi lại retrieval timestamp
- Lấy metadata bổ sung từ datasource service (uploader, upload time, etc.)
- Tính toán file checksum để xác minh tính toàn vẹn
- Lưu metadata theo định dạng có cấu trúc cho các stage sau

**Tác động nghiệp vụ:**
- Cho phép comprehensive audit trails
- Hỗ trợ debugging và troubleshooting
- Cung cấp ngữ cảnh cho quality assessment

---

### YN-5: Khả năng phục hồi & Retry

**Ưu tiên:** P0 (Quan trọng)

**Mô tả:** Hệ thống phải xử lý gracefully các lỗi tạm thời và retry operations một cách thông minh.

**Tiêu chí chấp nhận:**
- Triển khai exponential backoff cho network failures
- Retry tối đa 3 lần cho transient errors
- Phân biệt giữa transient và permanent failures
- Log tất cả retry attempts với context
- Fail fast cho permanent errors (404, 403)

**Tác động nghiệp vụ:**
- Cải thiện độ tin cậy hệ thống trong điều kiện network không ổn định
- Giảm can thiệp thủ công cho các vấn đề tạm thời
- Cung cấp visibility rõ ràng về failure patterns

---

## Đặc tả chức năng

### ĐC-1: Lấy file từ MinIO

**Đầu vào:**
```typescript
interface LoadInput {
  fileId: string;           // UUID file identifier
  filePath: string;         // MinIO path (bucket/key)
  bucketName?: string;      // Optional bucket override
  presignedUrl?: string;    // Optional presigned URL
}
```

**Quy trình:**
1. Xác thực input parameters (fileId, filePath)
2. Xác định phương thức lấy file (presigned URL vs direct S3)
3. Khởi tạo file retrieval với phương thức thích hợp
4. Stream file content vào buffer hoặc temporary storage
5. Xác minh tính toàn vẹn file (checksum nếu available)
6. Trả về file buffer hoặc stream reference

**Đầu ra:**
```typescript
interface LoadOutput {
  // Cho file nhỏ (buffered)
  buffer?: Buffer;

  // Cho file lớn (streamed)
  streamPath?: string;
  stream?: ReadableStream;

  // Metadata chung
  metadata: {
    fileId: string;
    filename: string;
    size: number;                   // Bytes
    mimeType: string | null;        // Detected MIME type
    checksumMd5?: string;           // MD5 hash
    retrievedAt: Date;
    loadMethod: 'buffer' | 'stream'; // Phương thức đã sử dụng
  };
}
```

**Quy tắc nghiệp vụ:**
- File lớn hơn 50MB BẮT BUỘC sử dụng streaming
- Xác minh checksum là bắt buộc khi available
- Retrieval timeout: 60 giây cho file dưới 10MB, 5 phút cho file lớn hơn
- Concurrent retrievals giới hạn 10 mỗi instance

---

### ĐC-2: Phát hiện MIME Type

**Đầu vào:**
```typescript
interface MimeDetectionInput {
  buffer: Buffer;           // First 4KB của file
  filename: string;         // Filename gốc với extension
  reportedMimeType?: string; // MIME type từ datasource
}
```

**Quy trình:**
1. Đọc 4KB đầu của file (magic bytes)
2. Phát hiện MIME type sử dụng file-type library hoặc custom logic
3. Trích xuất extension từ filename
4. Xác minh chéo detected MIME với extension mapping
5. So sánh với reported MIME type (nếu có)
6. Giải quyết conflicts với thứ tự ưu tiên: magic bytes > extension > reported

**Đầu ra:**
```typescript
interface MimeDetectionOutput {
  detectedMimeType: string;
  confidence: 'high' | 'medium' | 'low';
  isSupported: boolean;
  suggestedParser?: 'pdf' | 'docx' | 'text' | 'code';
}
```

**MIME Types được hỗ trợ:**
- `application/pdf` → PDF documents
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` → DOCX
- `text/plain` → TXT files
- `text/markdown` → Markdown files
- `text/x-python`, `text/javascript`, etc. → Code files

**Quy tắc nghiệp vụ:**
- Unknown MIME types bị reject với thông báo lỗi rõ ràng
- MIME/extension mismatches trigger warning nhưng có thể proceed
- Text files mặc định UTF-8 encoding detection

---

### ĐC-3: Tích hợp Datasource Service

**Mục đích:** Lấy metadata file bổ sung từ datasource service

**Đầu vào:**
```typescript
{
  fileId: string;
}
```

**Quy trình:**
1. Thiết lập TCP connection đến datasource service
2. Gửi `get_file_metadata` request với fileId
3. Nhận metadata response
4. Xác thực response structure
5. Merge với local metadata
6. Xử lý service unavailability gracefully

**Đầu ra:**
```typescript
interface DatasourceMetadata {
  fileId: string;
  filename: string;
  filePath: string;          // MinIO path
  bucketName: string;
  uploadedBy: string;        // User ID
  uploadedAt: Date;
  originalSize: number;
  mimeType: string | null;
  documentType: 'public' | 'restricted';
}
```

**Quy tắc nghiệp vụ:**
- Datasource service timeout: 5 giây
- Cache metadata 5 phút để giảm TCP calls
- Nếu datasource unavailable, tiếp tục với local metadata only (degraded mode)
- Log datasource failures cho monitoring

---

### ĐC-4: Xác minh tính toàn vẹn file

**Mục đích:** Đảm bảo file không bị corrupted trong quá trình transfer

**Đầu vào:**
```typescript
{
  buffer: Buffer;
  expectedChecksum?: string;  // Từ datasource hoặc MinIO
  checksumAlgorithm?: 'md5' | 'sha256';
}
```

**Quy trình:**
1. Tính toán checksum của file đã lấy
2. So sánh với expected checksum (nếu có)
3. Nếu mismatch, flag as corrupted
4. Nếu không có expected checksum, lưu calculated value để tham khảo

**Đầu ra:**
```typescript
{
  isValid: boolean;
  calculatedChecksum: string;
  checksumAlgorithm: string;
  mismatchDetails?: {
    expected: string;
    actual: string;
  };
}
```

**Quy tắc nghiệp vụ:**
- Checksum failures dẫn đến permanent error (không retry)
- Sử dụng MD5 mặc định để tương thích với S3
- SHA-256 có sẵn như option cho security cao hơn
- Log tất cả checksum mismatches để điều tra

---

## Phương pháp kỹ thuật

### Kiến trúc thành phần

```
LoadStage
├── LoadService (Orchestrator)
│   ├── Điều phối retrieval workflow
│   ├── Quản lý state transitions
│   └── Coordination xử lý lỗi
│
├── MinIO Integration
│   ├── MinioService
│   │   └── S3-compatible client wrapper
│   ├── GetFileOperation
│   │   └── Logic lấy file (buffered)
│   └── StreamFileOperation
│       └── Streaming cho file lớn
│
├── Datasource Integration
│   ├── DatasourceClient
│   │   └── TCP client cho metadata
│   └── MetadataCache
│       └── Redis cache cho metadata
│
├── File Type Detection
│   ├── MimeTypeDetector
│   │   └── Phân tích magic byte
│   └── FileTypeValidator
│       └── Kiểm tra supported type
│
└── Integrity Verification
    ├── ChecksumCalculator
    │   └── Tính toán MD5/SHA-256
    └── IntegrityValidator
        └── Logic so sánh
```

### Technology Stack

**Core Dependencies:**
- `@aws-sdk/client-s3`: MinIO S3 client
- `file-type`: MIME type detection từ buffer
- `mime-types`: Extension to MIME mapping
- `crypto`: Checksum calculation
- `stream`: Node.js streaming utilities

**Integration:**
- `@nestjs/microservices`: TCP client cho datasource
- `ioredis`: Metadata caching
- `winston`: Structured logging

---

## Điểm tích hợp

### 1. MinIO Object Storage

**Protocol:** S3-compatible API (HTTP/HTTPS)

**Operations:**
- `getObject(bucket, key)`: Lấy file
- `headObject(bucket, key)`: Lấy metadata only
- `getSignedUrl(bucket, key)`: Generate presigned URL (nếu cần)

**Configuration:**
```typescript
{
  endpoint: 'http://minio:9000',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  region: 'us-east-1',
  forcePathStyle: true,
  s3ForcePathStyle: true,
}
```

**Xử lý lỗi:**
- `NoSuchKey`: File not found (permanent error)
- `AccessDenied`: Permission issue (permanent error)
- `RequestTimeout`: Network issue (retry)
- `InternalError`: MinIO issue (retry)

---

### 2. Datasource Service (TCP)

**Protocol:** NestJS Microservices TCP

**Methods:**
- `get_file_metadata(fileId)`: Lấy file metadata

**Request:**
```typescript
{
  pattern: 'get_file_metadata',
  data: { fileId: 'file-uuid-123' }
}
```

**Response:**
```typescript
{
  success: boolean;
  data?: {
    fileId: string;
    filename: string;
    filePath: string;
    bucketName: string;
    uploadedBy: string;
    uploadedAt: string;
    size: number;
    mimeType: string | null;
    documentType: string;
  };
  error?: string;
}
```

**Fallback Strategy:**
- Primary: TCP call đến datasource service
- Fallback: Sử dụng job input data (fileId, filePath từ job payload)
- Degraded: Tiếp tục với minimal metadata

---

### 3. Workflow State (LangGraph)

**Input State:**
```typescript
{
  fileId: string;
  documentId: string;
  filePath: string;
  filename: string;
  mimeType: string | null;
  currentStage: 'init';
}
```

**Output State (Updated):**
```typescript
{
  ...inputState,
  buffer?: Buffer;          // Cho file nhỏ
  streamPath?: string;      // Cho file lớn
  loadMetadata: {
    retrievedAt: Date;
    size: number;
    detectedMimeType: string;
    checksumMd5: string;
    loadMethod: 'buffer' | 'stream';
  };
  currentStage: 'load';
  errors: [];
}
```

---

## Luồng dữ liệu

### Happy Path

```
1. Job bắt đầu
   ↓
2. LoadService.execute(jobData)
   ↓
3. DatasourceClient.getMetadata(fileId)
   ↓ (metadata)
4. Kiểm tra file size
   ↓
5a. Nếu file < 50MB:
    MinioService.getFile(filePath) → Buffer
   ↓
5b. Nếu file >= 50MB:
    MinioService.streamFile(filePath) → Stream + TempFile
   ↓
6. MimeTypeDetector.detect(buffer hoặc first chunk)
   ↓ (mimeType)
7. FileTypeValidator.isSupported(mimeType)
   ↓ (validation)
8. ChecksumCalculator.calculate(data)
   ↓ (checksum)
9. Return LoadResult
   ↓
10. Workflow transitions sang Parse Stage
    (Parse stage sẽ đọc từ buffer hoặc tempFile)
   ↓
11. Cleanup temp file (nếu có) sau Parse stage
```

### Error Path - File Not Found

```
1. LoadService.execute(jobData)
   ↓
2. MinioService.getFile(filePath)
   ↓ (NoSuchKey error)
3. ErrorHandler.classify(error)
   ↓ (PermanentError)
4. Không retry
   ↓
5. Return error cho workflow
   ↓
6. Workflow đánh dấu job as failed
   ↓
7. Job moved sang DLQ
```

### Error Path - Network Timeout

```
1. LoadService.execute(jobData)
   ↓
2. MinioService.getFile(filePath)
   ↓ (RequestTimeout error)
3. ErrorHandler.classify(error)
   ↓ (TemporaryError)
4. RetryManager.scheduleRetry(attempt: 1)
   ↓ (wait 5s)
5. MinioService.getFile(filePath)
   ↓ (success on retry)
6. Tiếp tục normal flow
```

---

## Chiến lược xử lý lỗi

### Phân loại lỗi

#### Lỗi vĩnh viễn (Không Retry)
**Đặc điểm:** Lặp lại operation sẽ không thành công

**Loại lỗi:**
- `FileNotFound`: MinIO NoSuchKey, 404 errors
- `AccessDenied`: Insufficient permissions, 403 errors
- `UnsupportedFileType`: MIME type không trong danh sách hỗ trợ
- `ChecksumMismatch`: File integrity failure
- `InvalidInput`: Missing hoặc malformed fileId/filePath

**Xử lý:**
- Log error với full context
- Đánh dấu job as permanently failed
- Return detailed error message cho user
- Move job sang Dead Letter Queue

---

#### Lỗi tạm thời (Retry với Backoff)
**Đặc điểm:** Vấn đề tạm thời có thể được giải quyết

**Loại lỗi:**
- `NetworkTimeout`: Request timeout, connection reset
- `ServiceUnavailable`: MinIO hoặc Datasource tạm thời down
- `RateLimitExceeded`: Too many requests (429)
- `InternalServerError`: MinIO 500 errors

**Xử lý:**
- Retry tối đa 3 lần
- Exponential backoff: 5s, 10s, 20s
- Log mỗi retry attempt
- Nếu tất cả retries fail, treat as permanent error

**Logic Retry:**
```
Attempt 1: Ngay lập tức
Attempt 2: Chờ 5 giây
Attempt 3: Chờ 10 giây (tích lũy: 15s)
Attempt 4: Chờ 20 giây (tích lũy: 35s)
Final Failure: Move sang DLQ
```

---

#### Lỗi tài nguyên (Retry với Adaptation)
**Đặc điểm:** Hạn chế tài nguyên hệ thống

**Loại lỗi:**
- `OutOfMemory`: Heap overflow khi load file lớn
- `DiskSpaceFull`: Temporary storage cạn kiệt
- `TooManyConnections`: Connection pool bão hòa

**Xử lý:**
- Giảm resource consumption (e.g., switch sang streaming)
- Retry với batch sizes nhỏ hơn hoặc approach khác
- Alert operations team nếu persistent
- Maximum 2 retries với adaptive strategy

**Adaptive Strategy:**
```
First Failure: Switch sang streaming mode
Second Failure: Tăng chunk size, giảm concurrency
Third Failure: Move sang DLQ, alert on-call
```

---

### Error Response Format

```typescript
{
  stage: 'load';
  errorCode: string;           // E.g., 'LOAD_FILE_NOT_FOUND'
  errorType: 'permanent' | 'temporary' | 'resource';
  message: string;             // Mô tả human-readable
  details: {
    fileId: string;
    filePath: string;
    attemptNumber: number;
    originalError: string;     // Stack trace hoặc original error
    timestamp: Date;
  };
  retryable: boolean;
  recommendedAction: string;   // Cho operators/users
}
```

---

## Xác thực & Bảo mật

### Xác thực Input

**Xác thực File Path:**
- Không được chứa path traversal sequences (`../`, `..\\`)
- Phải trong allowed bucket namespaces
- Độ dài: 1-1024 characters
- Pattern: `^[a-zA-Z0-9/_.-]+$`

**Xác thực File ID:**
- Phải là valid UUID v4 format
- Phải tồn tại trong indexing_jobs table
- Cross-reference với datasource service

**Xác thực File Size:**
- Minimum: 1 byte (non-empty)
- Maximum: 100MB cho single uploads
- Maximum: 5GB cho multipart uploads
- Reject empty files với clear error

### Cân nhắc bảo mật

**Access Control:**
- Xác minh job ownership trước khi file retrieval
- Sử dụng scoped MinIO credentials per service instance
- Không bao giờ expose MinIO credentials trong logs hoặc errors

**Data Privacy:**
- Không log file content hoặc sensitive metadata
- Sanitize file paths trong logs (mask bucket names nếu sensitive)
- Hỗ trợ encryption at rest (delegated sang MinIO)

**Injection Prevention:**
- Sanitize tất cả inputs trước khi pass sang MinIO SDK
- Validate MIME types against whitelist
- Reject files với suspicious extensions

---

## Yêu cầu hiệu năng

### Latency Targets

| File Size | Target Latency | Maximum Latency |
|-----------|---------------|-----------------|
| < 1MB | 500ms | 2s |
| 1-10MB | 2s | 5s |
| 10-50MB | 5s | 15s |
| 50-100MB | 15s | 30s |
| 100MB-1GB | 1 min | 3 min |
| 1-5GB | 3 min | 10 min |

### Throughput Targets

- **Concurrent Loads:** 10 files đồng thời
- **Bandwidth:** Tối đa 100MB/s aggregate (giới hạn bởi network)
- **Connection Pool:** 20 connections đến MinIO
- **Streaming Buffer:** 64KB chunks

### Resource Limits

**Memory:**
- Maximum per file (buffered): 100MB
- Maximum per file (streamed): 10MB buffer + disk
- Total service memory: 2GB (development), 4GB (production)

**Disk:**
- Temporary storage: 10GB per instance
- Automatic cleanup sau 24 giờ hoặc job completion

**Network:**
- Connection timeout: 10 giây
- Read timeout: 60 giây (adjustable dựa trên file size)
- Retry interval: 5-20 giây exponential backoff

---

## Chiến lược kiểm thử

### Unit Tests

**Coverage Target:** 90%

**Test Cases:**

1. **MinioService**
   - Lấy file thành công từ MinIO
   - Xử lý NoSuchKey error (file not found)
   - Xử lý AccessDenied error (permission issue)
   - Xử lý network timeout với retry
   - Xác minh checksum calculation

2. **MimeTypeDetector**
   - Phát hiện PDF từ magic bytes
   - Phát hiện DOCX từ magic bytes
   - Phát hiện text files bằng extension fallback
   - Xử lý unknown file types gracefully
   - Cross-verify MIME với extension

3. **FileTypeValidator**
   - Chấp nhận supported MIME types
   - Từ chối unsupported MIME types
   - Xử lý MIME/extension mismatches

4. **DatasourceClient**
   - Lấy metadata thành công qua TCP
   - Xử lý datasource service timeout
   - Fallback sang degraded mode khi unavailable
   - Cache metadata correctly

5. **LoadService (Orchestrator)**
   - Thực thi full load workflow thành công
   - Xử lý errors từ mỗi component
   - Transition workflow state correctly
   - Log tất cả operations với context

6. **StreamingService**
   - Stream file lớn sang temporary file
   - Xác minh không có memory overflow
   - Cleanup temporary files correctly
   - Handle backpressure properly

---

### Integration Tests

**Test Cases:**

1. **MinIO Integration**
   - Upload test file sang MinIO
   - Lấy file sử dụng LoadService
   - Xác minh file integrity (checksum match)
   - Test với files của nhiều sizes khác nhau (1KB, 1MB, 50MB, 100MB)

2. **Datasource Integration**
   - Start datasource service trong test container
   - Gọi get_file_metadata qua TCP
   - Xác minh response structure
   - Test timeout và retry behavior

3. **Streaming Integration**
   - Load 100MB file sử dụng streaming
   - Xác minh không có memory overflow
   - Validate temporary file creation và cleanup

4. **Error Scenarios**
   - File not found trong MinIO
   - Datasource service unavailable
   - Network timeout trong retrieval
   - Checksum mismatch

---

### Performance Tests

**Test Cases:**

1. **Latency Test**
   - Đo retrieval time cho different file sizes
   - Xác minh targets được đáp ứng (e.g., 1MB in < 2s)

2. **Concurrent Load Test**
   - Load 10 files đồng thời
   - Xác minh không có resource exhaustion
   - Đo aggregate throughput

3. **Large File Test**
   - Load 1GB file sử dụng streaming
   - Xác minh memory stays under 100MB
   - Đo total retrieval time

4. **Retry Test**
   - Simulate network failures
   - Xác minh retry logic executes correctly
   - Đo total time với retries

---

## Tiêu chí thành công

### Tiêu chí chức năng

- [ ] Lấy files thành công từ MinIO cho tất cả supported formats
- [ ] Phát hiện MIME types chính xác với 95%+ accuracy
- [ ] Xử lý files tối đa 5GB mà không memory overflow
- [ ] Tích hợp với datasource service với 99% success rate
- [ ] Retry transient failures tự động với backoff
- [ ] Xác minh file integrity sử dụng checksums
- [ ] Cung cấp detailed error messages cho tất cả failure scenarios
- [ ] Streaming hoạt động correctly cho files >50MB

### Tiêu chí phi chức năng

- [ ] Đáp ứng latency targets cho tất cả file size categories
- [ ] Hỗ trợ 10 concurrent file loads mà không degradation
- [ ] Đạt 90%+ unit test coverage
- [ ] Pass tất cả integration tests với real MinIO và datasource
- [ ] Xử lý 1000 load operations mà không memory leak
- [ ] Log tất cả operations với structured context
- [ ] Document tất cả public APIs và error codes
- [ ] Temporary files được cleanup correctly (0 orphans sau 24h)

### Tiêu chí chất lượng

- [ ] Zero sử dụng `any` hoặc `as` type assertions
- [ ] Tất cả inputs được validated trước khi processing
- [ ] Tất cả errors properly classified và handled
- [ ] Tất cả external calls có timeout và retry logic
- [ ] Tất cả temporary resources được cleaned up properly
- [ ] Tất cả sensitive data được sanitized trong logs

---

## Các giai đoạn triển khai

### Phase 1: Core Implementation (Tuần 1)

**Deliverables:**
- [ ] LoadModule structure
- [ ] MinioService với basic getFile operation
- [ ] MimeTypeDetector implementation
- [ ] FileTypeValidator cho supported types
- [ ] Basic error handling (permanent vs temporary)
- [ ] Unit tests cho core components

**Dependencies:**
- MinIO instance running và accessible
- S3 SDK configured với credentials

---

### Phase 2: Integration & Streaming (Tuần 2)

**Deliverables:**
- [ ] DatasourceClient TCP integration
- [ ] Metadata caching với Redis
- [ ] StreamingService implementation
- [ ] Temporary file management và cleanup
- [ ] ChecksumCalculator implementation
- [ ] IntegrityValidator
- [ ] Integration tests với MinIO
- [ ] Integration tests với datasource service

**Dependencies:**
- Datasource service running
- Redis instance cho caching
- Disk space cho temporary files

---

### Phase 3: Advanced Features (Tuần 3)

**Deliverables:**
- [ ] Retry logic với exponential backoff
- [ ] Adaptive resource error handling
- [ ] Presigned URL support (nếu cần)
- [ ] Performance tests
- [ ] Load testing với concurrent files
- [ ] Memory profiling cho streaming

**Dependencies:**
- Test files của nhiều sizes prepared
- Performance monitoring tools

---

### Phase 4: Observability & Polish (Tuần 4)

**Deliverables:**
- [ ] Structured logging throughout
- [ ] Metrics collection (latency, throughput, errors)
- [ ] Comprehensive error messages
- [ ] Documentation (API docs, troubleshooting guide)
- [ ] Final integration với LangGraph workflow
- [ ] End-to-end testing với full pipeline

**Dependencies:**
- Monitoring infrastructure (Prometheus, Grafana)
- LangGraph workflow skeleton ready

---

## Phụ thuộc & Rủi ro

### External Dependencies

| Dependency | Purpose | Risk | Mitigation |
|------------|---------|------|------------|
| MinIO | Object storage | Service downtime | Retry logic, health checks |
| Datasource Service | File metadata | Service unavailable | Graceful degradation, caching |
| Redis | Metadata caching | Cache miss rate | Fallback sang direct calls |
| AWS SDK | S3 client | API changes | Pin version, comprehensive tests |

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| MinIO performance degradation | Medium | High | Monitor latency, alert on SLA breach |
| Large file memory overflow | Medium | Critical | Mandatory streaming cho >50MB files |
| Network instability | Medium | Medium | Robust retry logic, timeout tuning |
| MIME detection inaccuracy | Low | Medium | Magic byte analysis + extension verification |
| Datasource service coupling | High | Medium | Graceful degradation khi unavailable |
| Disk space exhaustion | Medium | High | Monitor disk usage, auto cleanup old files |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Unsupported file types | High | Low | Clear error messages, documentation |
| File size limits | Medium | Medium | Enforce limits early, communicate sang users |
| Slow retrieval times | Medium | High | Performance monitoring, caching strategy |
| Temporary file orphans | Medium | Medium | Scheduled cleanup jobs, monitoring |

---

## Phụ lục

### A: Supported File Types

| Extension | MIME Type | Parser | Max Size |
|-----------|-----------|--------|----------|
| .pdf | application/pdf | PDFLoader | 100MB |
| .docx | application/vnd.openxmlformats-officedocument.wordprocessingml.document | DocxLoader | 50MB |
| .txt | text/plain | TextLoader | 10MB |
| .md | text/markdown | TextLoader | 10MB |
| .py | text/x-python | CodeLoader | 5MB |
| .js | text/javascript | CodeLoader | 5MB |
| .ts | text/typescript | CodeLoader | 5MB |
| .java | text/x-java-source | CodeLoader | 5MB |
| .cpp | text/x-c++src | CodeLoader | 5MB |

### B: Error Codes

| Code | Type | Description | Retryable |
|------|------|-------------|-----------|
| LOAD_FILE_NOT_FOUND | Permanent | File không tồn tại trong MinIO | Không |
| LOAD_ACCESS_DENIED | Permanent | Insufficient permissions | Không |
| LOAD_UNSUPPORTED_TYPE | Permanent | File type không được hỗ trợ | Không |
| LOAD_CHECKSUM_MISMATCH | Permanent | File integrity check failed | Không |
| LOAD_NETWORK_TIMEOUT | Temporary | Network request timeout | Có (3x) |
| LOAD_SERVICE_UNAVAILABLE | Temporary | MinIO/Datasource unavailable | Có (3x) |
| LOAD_RATE_LIMITED | Temporary | Too many requests | Có (3x) |
| LOAD_OUT_OF_MEMORY | Resource | Memory exhausted | Có (2x, adapt) |
| LOAD_DISK_FULL | Resource | Temporary storage full | Có (2x, adapt) |

### C: Configuration Reference

```typescript
interface LoadStageConfig {
  // MinIO Configuration
  minio: {
    endpoint: string;
    port: number;
    accessKey: string;
    secretKey: string;
    useSSL: boolean;
    region: string;
  };

  // Datasource Configuration
  datasource: {
    host: string;
    port: number;
    timeout: number;           // Default: 5000ms
    cacheEnabled: boolean;
    cacheTTL: number;          // Default: 300s (5 min)
  };

  // File Handling
  files: {
    maxSizeSingle: number;     // Default: 100MB
    maxSizeMultipart: number;  // Default: 5GB
    streamingThreshold: number; // Default: 50MB
    tempStoragePath: string;   // Default: /tmp/indexing
    cleanupAfterHours: number; // Default: 24
  };

  // Performance
  performance: {
    connectionPoolSize: number; // Default: 20
    concurrentLoads: number;    // Default: 10
    chunkSize: number;          // Default: 64KB
    connectionTimeout: number;  // Default: 10000ms
    readTimeout: number;        // Default: 60000ms
  };

  // Retry Configuration
  retry: {
    maxAttempts: number;        // Default: 3
    backoffMultiplier: number;  // Default: 2
    initialDelayMs: number;     // Default: 5000
  };

  // Security
  security: {
    validateChecksums: boolean; // Default: true
    checksumAlgorithm: 'md5' | 'sha256'; // Default: md5
    allowedBuckets: string[];   // Whitelist
  };
}
```

---

## Phê duyệt & Ký tên

| Vai trò | Tên | Chữ ký | Ngày |
|---------|-----|---------|------|
| Engineering Lead | ___________ | ___________ | ___________ |
| Tech Lead | ___________ | ___________ | ___________ |
| QA Lead | ___________ | ___________ | ___________ |

---

**Trạng thái tài liệu:** Nháp
**Xem xét tiếp theo:** 2025-11-10
**Lịch sử phiên bản:**
- v1.0 (2025-11-03): Tạo Load Stage implementation plan ban đầu (tiếng Việt)

---

**Kết thúc tài liệu**
