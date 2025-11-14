# Kế Hoạch Triển Khai Parse Stage

**Phiên bản:** 1.0
**Cập nhật lần cuối:** 2025-11-03
**Trạng thái:** Nháp
**Giai đoạn:** 2/7 (Parse)

---

## Mục lục

1. [Tổng quan](#tổng-quan)
2. [Yêu cầu nghiệp vụ](#yêu-cầu-nghiệp-vụ)
3. [Đặc tả chức năng](#đặc-tả-chức-năng)
4. [Phương pháp kỹ thuật](#phương-pháp-kỹ-thuật)
5. [Điểm tích hợp](#điểm-tích-hợp)
6. [Luồng dữ liệu](#luồng-dữ-liệu)
7. [Chiến lược xử lý lỗi](#chiến-lược-xử-lý-lỗi)
8. [Yêu cầu hiệu năng](#yêu-cầu-hiệu-năng)
9. [Chiến lược kiểm thử](#chiến-lược-kiểm-thử)
10. [Tiêu chí thành công](#tiêu-chí-thành-công)
11. [Các giai đoạn triển khai](#các-giai-đoạn-triển-khai)
12. [Phụ thuộc & Rủi ro](#phụ-thuộc--rủi-ro)

---

## Tổng quan

### Mục đích

Parse Stage là giai đoạn thứ hai của pipeline indexing, chịu trách nhiệm chuyển đổi file nhị phân thô thành văn bản thuần túy với metadata cơ bản. Giai đoạn này sử dụng LangChain.js Document Loaders để phân tích nhiều định dạng file khác nhau và trích xuất nội dung có thể xử lý được. **Parse Stage chỉ tập trung vào việc extract text, không phân tích cấu trúc.**

### Phạm vi

**Trong phạm vi:**
- Phân tích PDF thành văn bản (split by pages)
- Phân tích DOCX thành văn bản thuần
- Phân tích TXT/MD với phát hiện encoding tự động
- Phân tích Code files với giữ nguyên formatting
- Trích xuất metadata cơ bản (file info, số trang, số dòng)
- Chuẩn hóa content (line endings, encoding, whitespace)
- Tạo Document objects theo chuẩn LangChain
- **Đảm bảo output format nhất quán** cho tất cả file types

**Ngoài phạm vi:**
- **Phân tích cấu trúc document** (headings, sections → Structure Stage)
- **Trích xuất tables** (→ Structure Stage hoặc special handling)
- OCR cho PDF scan (→ external service nếu cần)
- Trích xuất nội dung phức tạp từ hình ảnh
- Chuyển đổi video/audio thành văn bản
- Dịch đa ngôn ngữ
- Trích xuất entities (→ Enrich stage)
- Chunking documents (→ Chunk stage)

### Giá trị nghiệp vụ

1. **Hỗ trợ đa định dạng:** Cho phép indexing nhiều loại file khác nhau với cùng một pipeline
2. **Chất lượng nội dung:** Trích xuất văn bản sạch và có thể đọc được
3. **Output nhất quán:** Tất cả file types đều trả về cùng Document format (LangChain standard)
4. **Đơn giản và đáng tin cậy:** Chỉ làm một việc và làm tốt - extract text
5. **Khả năng mở rộng:** Dễ dàng thêm parser mới cho định dạng file mới

---

## Yêu cầu nghiệp vụ

### YN-1: Phân tích PDF

**Ưu tiên:** P0 (Quan trọng)

**Mô tả:** Hệ thống phải phân tích file PDF và trích xuất văn bản với giữ nguyên cấu trúc trang và metadata.

**Tiêu chí chấp nhận:**
- Phân tích PDF lên đến 1000 trang
- Trích xuất văn bản từ mỗi trang thành Document riêng biệt
- Giữ nguyên số trang trong metadata
- Phát hiện và bỏ qua password-protected PDFs với thông báo rõ ràng
- Xử lý PDF với embedded fonts
- **Chỉ extract text, không phân tích structure hay tables** (tables → text as-is)

**Tác động nghiệp vụ:**
- PDF là định dạng tài liệu phổ biến nhất trong doanh nghiệp
- Cho phép indexing technical documents, reports, và presentations
- Giữ nguyên page boundaries giúp downstream processing

**Phương pháp kỹ thuật:**

Sử dụng LangChain.js `PDFLoader` từ `@langchain/community/document_loaders/fs/pdf`:

```typescript
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

interface PDFParseOptions {
  splitPages: boolean;  // true: một Document per page, false: toàn bộ PDF
  parsedItemSeparator: string;  // Separator giữa các text items
}

async function parsePDF(filePath: string): Promise<Document[]> {
  const loader = new PDFLoader(filePath, {
    splitPages: true,  // Chia theo trang
    parsedItemSeparator: ' ',  // Space giữa text items
  });

  const docs = await loader.load();

  // Mỗi doc có structure:
  // {
  //   pageContent: "extracted text...",
  //   metadata: {
  //     source: filePath,
  //     pdf: {
  //       version: "1.7",
  //       info: {...},
  //       metadata: {...},
  //       totalPages: 100
  //     },
  //     loc: { pageNumber: 1 }
  //   }
  // }

  return docs;
}
```

**Xử lý các trường hợp đặc biệt:**

```typescript
// 1. Password-protected PDF
try {
  const docs = await loader.load();
} catch (error) {
  if (error.message.includes('password') || error.message.includes('encrypted')) {
    throw new PasswordProtectedPDFError(
      'PDF file is password-protected. Please provide an unencrypted version.'
    );
  }
  throw error;
}

// 2. Corrupted PDF
try {
  const docs = await loader.load();
} catch (error) {
  if (error.message.includes('Invalid PDF')) {
    throw new CorruptedPDFError(
      'PDF file is corrupted or invalid. Unable to parse.'
    );
  }
  throw error;
}

// 3. Empty pages
const nonEmptyDocs = docs.filter(doc => {
  const trimmedContent = doc.pageContent.trim();
  return trimmedContent.length > 0;
});
```

---

### YN-2: Phân tích DOCX

**Ưu tiên:** P0 (Quan trọng)

**Mô tả:** Hệ thống phải phân tích Microsoft Word documents (.docx) và trích xuất nội dung với định dạng cơ bản.

**Tiêu chí chấp nhận:**
- Phân tích file .docx (OOXML format)
- Trích xuất toàn bộ text content (paragraphs, headings, lists as plain text)
- Giữ nguyên line breaks cơ bản
- Xử lý file lên đến 50MB
- **Không phân tích structure** (headings detection → Structure Stage)
- **Không extract tables** (tables → text as-is)

**Tác động nghiệp vụ:**
- DOCX là định dạng chuẩn cho business documents
- Cho phép indexing contracts, proposals, và reports
- Text thuần đảm bảo output nhất quán

**Phương pháp kỹ thuật:**

Sử dụng LangChain.js `DocxLoader` từ `@langchain/community/document_loaders/fs/docx`:

```typescript
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';

async function parseDOCX(filePath: string): Promise<Document[]> {
  const loader = new DocxLoader(filePath);
  const docs = await loader.load();

  // DocxLoader trả về single Document với toàn bộ nội dung
  // {
  //   pageContent: "Full document text with preserved structure...",
  //   metadata: {
  //     source: filePath
  //   }
  // }

  // Enrich với basic metadata
  const enrichedDocs = docs.map(doc => ({
    ...doc,
    metadata: {
      ...doc.metadata,
      documentType: 'docx',
      characterCount: doc.pageContent.length,
      wordCount: doc.pageContent.split(/\s+/).filter(w => w.length > 0).length,
      lineCount: doc.pageContent.split('\n').length,
    },
  }));

  return enrichedDocs;
}
```

---

### YN-3: Phân tích Text & Markdown

**Ưu tiên:** P0 (Quan trọng)

**Mô tả:** Hệ thống phải phân tích plain text và Markdown files với phát hiện encoding tự động.

**Tiêu chí chấp nhận:**
- Phân tích .txt, .md, .markdown files
- Phát hiện tự động encoding (UTF-8, UTF-16, ISO-8859-1)
- Giữ nguyên content (bao gồm Markdown syntax như ##, **, etc.)
- Xử lý file lên đến 10MB
- Chuẩn hóa line endings (CRLF → LF)
- Loại bỏ BOM (Byte Order Mark) nếu có
- **Không parse Markdown structure** (## heading detection → Structure Stage)

**Tác động nghiệp vụ:**
- Text files là định dạng đơn giản nhất và phổ biến
- Markdown phổ biến cho technical documentation
- Encoding đúng đảm bảo không bị garbled text

**Phương pháp kỹ thuật:**

Sử dụng LangChain.js `TextLoader` từ `langchain/document_loaders/fs/text`:

```typescript
import { TextLoader } from 'langchain/document_loaders/fs/text';

async function parseText(filePath: string): Promise<Document[]> {
  const loader = new TextLoader(filePath);
  const docs = await loader.load();

  // TextLoader trả về single Document
  // {
  //   pageContent: "file content...",
  //   metadata: {
  //     source: filePath
  //   }
  // }

  return docs;
}
```

**Phát hiện encoding nâng cao:**

Sử dụng `chardet` library để phát hiện encoding trước khi load:

```typescript
import * as fs from 'fs';
import * as chardet from 'chardet';
import * as iconv from 'iconv-lite';

async function parseTextWithEncodingDetection(filePath: string): Promise<Document[]> {
  // 1. Đọc file as buffer
  const buffer = await fs.promises.readFile(filePath);

  // 2. Phát hiện encoding
  const detectedEncoding = chardet.detect(buffer);
  const encoding = detectedEncoding || 'utf-8';

  // 3. Decode với encoding đã phát hiện
  let content = iconv.decode(buffer, encoding);

  // 4. Loại bỏ BOM nếu có
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  // 5. Chuẩn hóa line endings
  content = content.replace(/\r\n/g, '\n');

  // 6. Tạo Document
  const doc: Document = {
    pageContent: content,
    metadata: {
      source: filePath,
      encoding,
      detectedEncoding,
      lineCount: content.split('\n').length,
      characterCount: content.length,
    },
  };

  return [doc];
}
```

**Xử lý Markdown structure:**

```typescript
// Note: Markdown syntax (##, **, ``` etc.) được giữ nguyên trong pageContent
// Structure parsing (heading detection, link extraction) sẽ được xử lý bởi Structure Stage
```

---

### YN-4: Phân tích Code Files

**Ưu tiên:** P1 (Cao)

**Mô tả:** Hệ thống phải phân tích source code files và trích xuất nội dung với metadata về ngôn ngữ.

**Tiêu chí chấp nhận:**
- Hỗ trợ: .py, .js, .ts, .tsx, .java, .cpp, .c, .h, .go, .rs, .rb
- Phát hiện ngôn ngữ lập trình từ extension
- Giữ nguyên syntax và indentation hoàn toàn
- Trích xuất metadata: language, line count, file size
- Xử lý file lên đến 5MB
- **Không parse code structure** (function/class extraction → Structure Stage)

**Tác động nghiệp vụ:**
- Cho phép indexing technical documentation dạng code
- Hỗ trợ code search và code snippet retrieval
- Giữ nguyên syntax giúp preserve context

**Phương pháp kỹ thuật:**

```typescript
const SUPPORTED_LANGUAGES: Record<string, string> = {
  '.py': 'python',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript-react',
  '.jsx': 'javascript-react',
  '.java': 'java',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c-header',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
};

async function parseCodeFile(filePath: string): Promise<Document[]> {
  const extension = path.extname(filePath);
  const language = SUPPORTED_LANGUAGES[extension];

  if (!language) {
    throw new UnsupportedFileTypeError(`Code file extension ${extension} not supported`);
  }

  // Sử dụng TextLoader cho code files
  const loader = new TextLoader(filePath);
  const docs = await loader.load();

  // Enrich với code-specific metadata
  const enrichedDocs = docs.map(doc => ({
    ...doc,
    metadata: {
      ...doc.metadata,
      documentType: 'code',
      language,
      extension,
      lineCount: doc.pageContent.split('\n').length,
      characterCount: doc.pageContent.length,
    },
  }));

  return enrichedDocs;
}

// Note: Code structure (functions, classes, imports) được giữ nguyên trong text
// Code parsing sẽ được xử lý bởi Structure Stage nếu cần
```

---

### YN-5: Xử lý parsing errors gracefully

**Ưu tiên:** P0 (Quan trọng)

**Mô tả:** Hệ thống phải xử lý lỗi parsing một cách khéo léo và cung cấp thông tin lỗi chi tiết.

**Tiêu chí chấp nhận:**
- Phân loại lỗi: permanent vs temporary
- Log lỗi với full context (fileId, filePath, error message)
- Không crash toàn bộ job khi một file thất bại
- Cung cấp thông báo lỗi rõ ràng cho user
- Tùy chọn: Fallback sang text extraction đơn giản cho PDF phức tạp

**Tác động nghiệp vụ:**
- Tăng độ tin cậy của hệ thống
- Giảm can thiệp thủ công
- Cung cấp visibility về file issues

**Phương pháp kỹ thuật:**

```typescript
enum ParseErrorType {
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  CORRUPTED_FILE = 'CORRUPTED_FILE',
  PASSWORD_PROTECTED = 'PASSWORD_PROTECTED',
  EMPTY_FILE = 'EMPTY_FILE',
  ENCODING_ERROR = 'ENCODING_ERROR',
  TIMEOUT = 'TIMEOUT',
  MEMORY_EXCEEDED = 'MEMORY_EXCEEDED',
}

class ParseError extends Error {
  constructor(
    public type: ParseErrorType,
    public fileId: string,
    public filePath: string,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

async function safeParseFile(
  fileId: string,
  filePath: string,
  mimeType: string
): Promise<{ success: boolean; documents?: Document[]; error?: ParseError }> {
  try {
    // Timeout protection
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    const documentsPromise = parseFileByMimeType(filePath, mimeType);
    const documents = await Promise.race([
      documentsPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Parse timeout')), timeoutMs)
      ),
    ]);

    // Validation
    if (!documents || documents.length === 0) {
      throw new ParseError(
        ParseErrorType.EMPTY_FILE,
        fileId,
        filePath,
        'No content extracted from file'
      );
    }

    return { success: true, documents };

  } catch (error) {
    // Classify error
    let errorType = ParseErrorType.CORRUPTED_FILE;

    if (error.message.includes('timeout')) {
      errorType = ParseErrorType.TIMEOUT;
    } else if (error.message.includes('password') || error.message.includes('encrypted')) {
      errorType = ParseErrorType.PASSWORD_PROTECTED;
    } else if (error.message.includes('encoding')) {
      errorType = ParseErrorType.ENCODING_ERROR;
    } else if (error.message.includes('memory') || error.message.includes('heap')) {
      errorType = ParseErrorType.MEMORY_EXCEEDED;
    }

    const parseError = new ParseError(
      errorType,
      fileId,
      filePath,
      `Failed to parse file: ${error.message}`,
      error
    );

    // Log với full context
    logger.error('Parse error', {
      fileId,
      filePath,
      errorType,
      originalError: error.message,
      stack: error.stack,
    });

    return { success: false, error: parseError };
  }
}
```

---

## Đặc tả chức năng

### ĐC-1: Parser Selection

**Mục đích:** Chọn parser phù hợp dựa trên MIME type và file extension

**Đầu vào:**
```typescript
interface ParserSelectionInput {
  fileId: string;
  filePath: string;
  mimeType: string | null;
  filename: string;
}
```

**Quy trình:**
1. Xác định MIME type (từ Load stage hoặc file extension)
2. Map MIME type sang parser type
3. Fallback sang extension-based detection nếu MIME unknown
4. Validate parser có available
5. Return parser instance

**Đầu ra:**
```typescript
interface ParserSelectionOutput {
  parserType: 'pdf' | 'docx' | 'text' | 'code' | 'markdown';
  loader: BaseDocumentLoader;
  options: Record<string, unknown>;
}
```

**Implementation:**

```typescript
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { TextLoader } from 'langchain/document_loaders/fs/text';

type ParserType = 'pdf' | 'docx' | 'text' | 'code' | 'markdown';

interface LoaderFactory {
  createLoader(filePath: string, options?: Record<string, unknown>): BaseDocumentLoader;
}

const MIME_TO_PARSER: Record<string, ParserType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'text',
  'text/markdown': 'markdown',
  'text/x-python': 'code',
  'text/javascript': 'code',
  'application/javascript': 'code',
  'text/x-typescript': 'code',
  'text/x-java-source': 'code',
  'text/x-c': 'code',
  'text/x-c++src': 'code',
};

const EXTENSION_TO_PARSER: Record<string, ParserType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.doc': 'docx',
  '.txt': 'text',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.py': 'code',
  '.js': 'code',
  '.ts': 'code',
  '.tsx': 'code',
  '.jsx': 'code',
  '.java': 'code',
  '.cpp': 'code',
  '.c': 'code',
  '.h': 'code',
  '.go': 'code',
  '.rs': 'code',
};

function selectParser(input: ParserSelectionInput): ParserSelectionOutput {
  // 1. Try MIME type mapping
  let parserType: ParserType | null = null;

  if (input.mimeType) {
    parserType = MIME_TO_PARSER[input.mimeType];
  }

  // 2. Fallback to extension
  if (!parserType) {
    const extension = path.extname(input.filename).toLowerCase();
    parserType = EXTENSION_TO_PARSER[extension];
  }

  // 3. Throw if unsupported
  if (!parserType) {
    throw new UnsupportedFileTypeError(
      `Unsupported file type: ${input.mimeType} (${input.filename})`
    );
  }

  // 4. Create loader
  const loader = createLoader(parserType, input.filePath);

  // 5. Return selection
  return {
    parserType,
    loader,
    options: getParserOptions(parserType),
  };
}

function createLoader(parserType: ParserType, filePath: string): BaseDocumentLoader {
  switch (parserType) {
    case 'pdf':
      return new PDFLoader(filePath, {
        splitPages: true,
        parsedItemSeparator: ' ',
      });

    case 'docx':
      return new DocxLoader(filePath);

    case 'text':
    case 'code':
    case 'markdown':
      return new TextLoader(filePath);

    default:
      throw new Error(`Unknown parser type: ${parserType}`);
  }
}
```

---

### ĐC-2: Document Parsing

**Mục đích:** Phân tích file và trả về array of Document objects

**Đầu vào:**
```typescript
interface ParsingInput {
  fileId: string;
  filePath: string;  // Local path hoặc stream path từ Load stage
  mimeType: string;
  filename: string;
  fileSize: number;
}
```

**Quy trình:**
1. Select parser dựa trên MIME type/extension
2. Load file content sử dụng parser
3. Validate parsed documents
4. Enrich với metadata bổ sung
5. Normalize content (whitespace, encoding)
6. Return array of Documents

**Đầu ra:**
```typescript
interface ParsingOutput {
  documents: Document[];
  metadata: {
    fileId: string;
    filename: string;
    parserType: string;
    documentCount: number;
    totalCharacters: number;
    parseTime: number;  // milliseconds
  };
}
```

**Document Structure (LangChain Standard):**

```typescript
interface Document {
  pageContent: string;
  metadata: {
    source: string;  // File path
    fileId: string;
    filename: string;
    documentType: string;  // 'pdf', 'docx', 'text', 'code'

    // PDF specific
    loc?: {
      pageNumber: number;
    };

    // Code specific
    language?: string;
    extension?: string;

    // General
    characterCount?: number;
    lineCount?: number;

    [key: string]: unknown;
  };
  id?: string;
}
```

**Implementation:**

```typescript
async function parseDocument(input: ParsingInput): Promise<ParsingOutput> {
  const startTime = Date.now();

  // 1. Select parser
  const { parserType, loader } = selectParser({
    fileId: input.fileId,
    filePath: input.filePath,
    mimeType: input.mimeType,
    filename: input.filename,
  });

  // 2. Load documents
  let documents = await loader.load();

  // 3. Validate
  if (!documents || documents.length === 0) {
    throw new EmptyDocumentError('No content extracted from file');
  }

  // 4. Enrich metadata
  documents = documents.map((doc, index) => ({
    ...doc,
    metadata: {
      ...doc.metadata,
      fileId: input.fileId,
      filename: input.filename,
      documentType: parserType,
      documentIndex: index,
      characterCount: doc.pageContent.length,
      lineCount: doc.pageContent.split('\n').length,
    },
  }));

  // 5. Normalize content
  documents = documents.map(doc => ({
    ...doc,
    pageContent: normalizeContent(doc.pageContent),
  }));

  // 6. Calculate metadata
  const totalCharacters = documents.reduce(
    (sum, doc) => sum + doc.pageContent.length,
    0
  );

  const parseTime = Date.now() - startTime;

  return {
    documents,
    metadata: {
      fileId: input.fileId,
      filename: input.filename,
      parserType,
      documentCount: documents.length,
      totalCharacters,
      parseTime,
    },
  };
}

function normalizeContent(content: string): string {
  // 1. Normalize line endings
  content = content.replace(/\r\n/g, '\n');

  // 2. Remove excessive whitespace (nhưng giữ structure)
  content = content.replace(/[ \t]+/g, ' ');  // Multiple spaces → single space
  content = content.replace(/\n{3,}/g, '\n\n');  // Multiple newlines → double newline

  // 3. Trim trailing whitespace per line
  content = content
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n');

  // 4. Trim leading/trailing whitespace
  content = content.trim();

  return content;
}
```

---

### ĐC-3: Metadata Enrichment

**Mục đích:** Thêm metadata phong phú vào parsed documents

**Đầu vào:**
```typescript
interface EnrichmentInput {
  documents: Document[];
  originalFileMetadata: {
    fileId: string;
    filename: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
    uploadedAt: Date;
  };
}
```

**Quy trình:**
1. Thêm file-level metadata vào mỗi document
2. Tính toán basic statistics (word count, character count, line count)
3. Thêm timestamps
4. Generate unique document IDs
5. **Không** phân tích structure (→ Structure Stage)

**Đầu ra:**
```typescript
interface EnrichmentOutput {
  enrichedDocuments: Document[];
}
```

**Implementation:**

```typescript
function enrichDocuments(input: EnrichmentInput): EnrichmentOutput {
  const enrichedDocuments = input.documents.map((doc, index) => {
    // Base metadata
    const enrichedMetadata = {
      ...doc.metadata,

      // File metadata
      fileId: input.originalFileMetadata.fileId,
      filename: input.originalFileMetadata.filename,
      fileSize: input.originalFileMetadata.fileSize,
      fileMimeType: input.originalFileMetadata.mimeType,
      uploadedBy: input.originalFileMetadata.uploadedBy,
      uploadedAt: input.originalFileMetadata.uploadedAt,

      // Document-specific
      documentIndex: index,
      documentId: generateDocumentId(input.originalFileMetadata.fileId, index),

      // Content statistics
      wordCount: countWords(doc.pageContent),
      characterCount: doc.pageContent.length,
      lineCount: doc.pageContent.split('\n').length,

      // Timestamps
      parsedAt: new Date(),
    };

    return {
      ...doc,
      metadata: enrichedMetadata,
    };
  });

  return { enrichedDocuments };
}

function generateDocumentId(fileId: string, documentIndex: number): string {
  return `${fileId}_doc_${documentIndex}`;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

// Note: Structure detection (headings, sections, code blocks)
// sẽ được xử lý bởi Structure Stage
```

---

## Phương pháp kỹ thuật

### Kiến trúc thành phần

```
ParseStage
├── ParseService (Orchestrator)
│   ├── Điều phối parsing workflow
│   ├── Parser selection logic
│   └── Error handling và retry
│
├── Document Loaders (LangChain.js)
│   ├── PDFLoader
│   │   └── pdf-parse library integration
│   ├── DocxLoader
│   │   └── officegen library integration
│   └── TextLoader
│       └── fs-based text reading
│
├── Parser Adapters
│   ├── PDFParserAdapter
│   │   └── Custom PDF handling logic
│   ├── DOCXParserAdapter
│   │   └── DOCX structure detection
│   ├── TextParserAdapter
│   │   └── Encoding detection
│   └── CodeParserAdapter
│       └── Language detection
│
├── Content Normalizer
│   ├── WhitespaceNormalizer
│   ├── EncodingConverter
│   └── StructureCleaner
│
└── Metadata Enricher
    ├── FileMetadataExtractor
    ├── ContentStatisticsCalculator
    └── StructureDetector
```

### Technology Stack

**Core Dependencies:**
- `@langchain/community`: Document loaders (PDFLoader, DocxLoader)
- `langchain`: Base document loader interface, TextLoader
- `pdf-parse`: PDF parsing (underlying library for PDFLoader)
- `mammoth`: DOCX parsing (underlying library for DocxLoader)
- `chardet`: Character encoding detection
- `iconv-lite`: Encoding conversion

**Optional Dependencies:**
- `unstructured`: Advanced document parsing (tables, images)
- `tesseract.js`: OCR for scanned documents (future)

---

## Điểm tích hợp

### 1. Load Stage (Input)

**Protocol:** LangGraph state transition

**Input State:**
```typescript
{
  fileId: string;
  documentId: string;
  filePath: string;  // Local temp path hoặc stream path
  filename: string;
  buffer?: Buffer;  // Cho file nhỏ
  streamPath?: string;  // Cho file lớn
  loadMetadata: {
    retrievedAt: Date;
    size: number;
    detectedMimeType: string;
    checksumMd5: string;
    loadMethod: 'buffer' | 'stream';
  };
  currentStage: 'load';
}
```

**Parse Stage Access:**
- Nếu `buffer` available: Ghi ra temporary file
- Nếu `streamPath` available: Sử dụng trực tiếp
- MIME type từ `loadMetadata.detectedMimeType`

---

### 2. Structure Stage (Output)

**Protocol:** LangGraph state transition

**Output State:**
```typescript
{
  ...inputState,
  parsedDocs: Document[];  // LangChain Document array
  parseMetadata: {
    parserType: string;
    documentCount: number;
    totalCharacters: number;
    parseTime: number;
    parsedAt: Date;
  };
  currentStage: 'parse';
  errors: string[];
}
```

---

## Luồng dữ liệu

### Happy Path

```
1. Parse Stage bắt đầu với state từ Load Stage
   ↓
2. ParseService.execute(state)
   ↓
3. Xác định file path (buffer → temp file hoặc streamPath)
   ↓
4. selectParser(mimeType, filename)
   ↓ (parserType, loader)
5. loader.load()
   ↓ (documents: Document[])
6. Validate documents (không empty)
   ↓
7. enrichDocuments(documents, fileMetadata)
   ↓ (enrichedDocuments)
8. normalizeContent cho mỗi document
   ↓
9. Return ParseResult
   ↓
10. Update workflow state với parsedDocs
    ↓
11. Transition sang Structure Stage
```

### Error Path - Unsupported File Type

```
1. ParseService.execute(state)
   ↓
2. selectParser(mimeType, filename)
   ↓ (UnsupportedFileTypeError)
3. ErrorHandler.classify(error)
   ↓ (PermanentError)
4. Không retry
   ↓
5. Return error cho workflow
   ↓
6. Workflow đánh dấu job as failed
   ↓
7. Job moved sang DLQ với clear error message
```

### Error Path - Corrupted PDF

```
1. ParseService.execute(state)
   ↓
2. PDFLoader.load()
   ↓ (Invalid PDF error)
3. Try fallback: Text extraction mode
   ↓
4. Nếu fallback thành công: Proceed với warning
   ↓
5. Nếu fallback thất bại: Classify as permanent error
   ↓
6. Return error hoặc partial result
```

---

## Chiến lược xử lý lỗi

### Phân loại lỗi

#### Lỗi vĩnh viễn (Không Retry)
**Đặc điểm:** Lỗi về cấu trúc file hoặc định dạng

**Loại lỗi:**
- `UNSUPPORTED_FORMAT`: File type không được hỗ trợ
- `CORRUPTED_FILE`: File bị hỏng, không parse được
- `PASSWORD_PROTECTED`: PDF có password
- `EMPTY_FILE`: File không có nội dung

**Xử lý:**
- Log error với full context
- Đánh dấu job as permanently failed
- Provide user-friendly error message
- Move job sang Dead Letter Queue

---

#### Lỗi tạm thời (Retry với Backoff)
**Đặc điểm:** Vấn đề tạm thời có thể được giải quyết

**Loại lỗi:**
- `PARSE_TIMEOUT`: Parser timeout (file quá lớn)
- `MEMORY_EXCEEDED`: Out of memory (file phức tạp)
- `ENCODING_ERROR`: Lỗi decode encoding (có thể retry với encoding khác)

**Xử lý:**
- Retry tối đa 2 lần
- Linear backoff: 30s, 60s
- Giảm resource consumption (e.g., split file)
- Nếu tất cả retries fail, treat as permanent error

**Logic Retry:**
```
Attempt 1: Ngay lập tức với default parser settings
Attempt 2: Chờ 30 giây, try với fallback parser
Attempt 3: Chờ 60 giây, try với simplified extraction
Final Failure: Move sang DLQ
```

---

#### Lỗi có thể recover (Partial Success)
**Đặc điểm:** Một số page/section parse được, một số không

**Loại lỗi:**
- `PARTIAL_PDF_PARSE`: Một số trang PDF parse được
- `MIXED_ENCODING`: Một số sections có encoding khác

**Xử lý:**
- Parse những phần có thể parse được
- Log warning về phần failed
- Đánh dấu document với `partial: true` flag
- Continue với partial result
- Notify user về content loss

**Partial Success Strategy:**

```typescript
interface PartialParseResult {
  success: boolean;
  documents: Document[];
  warnings: string[];
  failedPages: number[];
  successRate: number;  // e.g., 0.95 (95%)
}

async function parseWithPartialSupport(
  filePath: string,
  parserType: string
): Promise<PartialParseResult> {
  const result: PartialParseResult = {
    success: false,
    documents: [],
    warnings: [],
    failedPages: [],
    successRate: 0,
  };

  try {
    // Attempt full parse
    result.documents = await parseFile(filePath, parserType);
    result.success = true;
    result.successRate = 1.0;

  } catch (error) {
    // Try page-by-page parse for PDF
    if (parserType === 'pdf') {
      result.documents = await parseFilePageByPage(filePath);
      result.successRate = result.documents.length / getTotalPages(filePath);

      // Accept if >80% pages parsed
      if (result.successRate > 0.8) {
        result.success = true;
        result.warnings.push(
          `Partial PDF parse: ${result.failedPages.length} pages failed`
        );
      }
    }
  }

  return result;
}
```

---

### Error Response Format

```typescript
interface ParseErrorResponse {
  stage: 'parse';
  errorCode: string;
  errorType: 'permanent' | 'temporary' | 'partial';
  message: string;
  details: {
    fileId: string;
    filename: string;
    mimeType: string;
    parserType: string;
    attemptNumber: number;
    originalError: string;
    timestamp: Date;

    // Partial failure details
    partialSuccess?: {
      documentsExtracted: number;
      totalExpected: number;
      successRate: number;
      failedPages: number[];
    };
  };
  retryable: boolean;
  recommendedAction: string;
}
```

**Error Codes:**

| Code | Type | Description | Retryable |
|------|------|-------------|-----------|
| PARSE_UNSUPPORTED_FORMAT | Permanent | File type không được hỗ trợ | Không |
| PARSE_CORRUPTED_FILE | Permanent | File bị hỏng | Không |
| PARSE_PASSWORD_PROTECTED | Permanent | PDF có password | Không |
| PARSE_EMPTY_FILE | Permanent | File không có nội dung | Không |
| PARSE_TIMEOUT | Temporary | Parser timeout | Có (2x) |
| PARSE_MEMORY_EXCEEDED | Temporary | Out of memory | Có (2x) |
| PARSE_ENCODING_ERROR | Temporary | Lỗi encoding | Có (2x) |
| PARSE_PARTIAL_SUCCESS | Partial | Một phần parse được | Không |

---

## Yêu cầu hiệu năng

### Latency Targets

| File Type | File Size | Target Latency | Maximum Latency |
|-----------|-----------|----------------|-----------------|
| PDF | < 10MB (< 100 pages) | 5s | 15s |
| PDF | 10-50MB (100-500 pages) | 20s | 60s |
| PDF | 50-100MB (500-1000 pages) | 60s | 180s |
| DOCX | < 5MB | 2s | 10s |
| DOCX | 5-50MB | 10s | 30s |
| TXT/MD | < 1MB | 500ms | 2s |
| TXT/MD | 1-10MB | 2s | 10s |
| Code | < 1MB | 500ms | 2s |

### Resource Limits

**Memory:**
- Maximum per file parsing: 500MB
- Total service memory: 2GB (development), 4GB (production)
- Swap to disk if needed cho file rất lớn

**CPU:**
- Maximum CPU per parse operation: 50% của một core
- Concurrent parsing: Tối đa 3 files đồng thời

**Disk:**
- Temporary storage cho streaming files: 5GB per instance
- Auto cleanup sau parse completion

---

## Chiến lược kiểm thử

### Unit Tests

**Coverage Target:** 90%

**Test Cases:**

1. **Parser Selection**
   - Chọn đúng parser cho PDF, DOCX, TXT, Code
   - Fallback sang extension khi MIME unknown
   - Throw error cho unsupported types
   - Handle missing hoặc invalid MIME types

2. **PDF Parsing** (`PDFLoader`)
   - Parse PDF thành công với multiple pages
   - Xác minh page count và page numbers
   - Handle password-protected PDFs gracefully
   - Handle corrupted PDFs với clear error
   - Extract metadata (title, author nếu có)

3. **DOCX Parsing** (`DocxLoader`)
   - Parse DOCX thành công
   - Extract headings và structure
   - Handle table content
   - Handle embedded images (metadata only)

4. **Text Parsing** (`TextLoader`)
   - Phát hiện encoding correctly (UTF-8, UTF-16, ISO-8859-1)
   - Xử lý BOM correctly
   - Normalize line endings
   - Handle large text files (>5MB)

5. **Code Parsing**
   - Phát hiện language từ extension
   - Giữ nguyên syntax và indentation
   - Extract metadata (line count, language)

6. **Content Normalization**
   - Normalize whitespace correctly
   - Preserve structure (paragraphs, sections)
   - Trim trailing whitespace
   - Handle special characters

7. **Metadata Enrichment**
   - Add file metadata correctly
   - Calculate statistics (word count, character count, line count)
   - Generate unique document IDs
   - **Không** detect document structure (→ Structure Stage)

8. **Error Handling**
   - Classify errors correctly (permanent, temporary, partial)
   - Log errors với full context
   - Return proper error responses
   - Partial success handling

---

### Integration Tests

**Test Cases:**

1. **End-to-End Parsing**
   - Upload test file → Load → Parse → Verify output
   - Test với files của mỗi supported type
   - Xác minh Document structure
   - Xác minh metadata completeness

2. **Large File Handling**
   - Parse 100MB PDF (500+ pages)
   - Xác minh không có memory overflow
   - Xác minh parse time acceptable
   - Verify streaming cleanup

3. **Error Scenarios**
   - Password-protected PDF → Clear error
   - Corrupted PDF → Graceful failure
   - Unsupported file type → Proper rejection
   - Empty file → Clear error

4. **LangChain Integration**
   - Xác minh Document objects follow LangChain standard
   - Test với downstream LangChain text splitters
   - Validate metadata structure

---

### Performance Tests

**Test Cases:**

1. **Latency Test**
   - Đo parse time cho different file types và sizes
   - Xác minh targets được đáp ứng
   - Profile bottlenecks

2. **Concurrent Parsing Test**
   - Parse 5 files đồng thời
   - Xác minh không có resource exhaustion
   - Đo aggregate throughput

3. **Memory Profiling**
   - Profile memory usage cho large PDFs
   - Xác minh không có memory leaks
   - Monitor garbage collection

4. **Stress Test**
   - Parse 1000 small files liên tục
   - Parse 100 large files
   - Xác minh stability

---

## Tiêu chí thành công

### Tiêu chí chức năng

- [ ] Parse PDF files thành công với >95% success rate (text extraction only)
- [ ] Parse DOCX files thành công với >98% success rate (plain text)
- [ ] Parse TXT/MD files với phát hiện encoding chính xác
- [ ] Parse Code files với giữ nguyên syntax hoàn toàn
- [ ] Xử lý partial parsing cho PDF phức tạp
- [ ] **Đảm bảo output format nhất quán** cho tất cả file types
- [ ] Phân loại errors correctly (permanent vs temporary)
- [ ] Cung cấp error messages rõ ràng cho users
- [ ] Return Documents theo LangChain Document standard

### Tiêu chí phi chức năng

- [ ] Đáp ứng latency targets cho tất cả file types
- [ ] Memory usage < 500MB per file parse
- [ ] Không có memory leaks trong 1000 parse operations
- [ ] Đạt 90%+ unit test coverage
- [ ] Pass tất cả integration tests
- [ ] Log tất cả operations với structured format
- [ ] Document tất cả parser APIs và error codes

### Tiêu chí chất lượng

- [ ] Zero sử dụng `any` hoặc `as` type assertions
- [ ] Tất cả inputs được validated
- [ ] Tất cả errors properly classified và handled
- [ ] Tất cả parsers có timeout protection
- [ ] Tất cả temporary files được cleaned up
- [ ] Tất cả Document outputs valid LangChain format
- [ ] **Không** có structure detection logic trong Parse Stage

---

## Các giai đoạn triển khai

### Phase 1: Core Parsers (Tuần 1)

**Deliverables:**
- [ ] ParseModule structure
- [ ] Parser selection logic (MIME mapping, extension fallback)
- [ ] PDFLoader integration với error handling
- [ ] DocxLoader integration
- [ ] TextLoader với encoding detection
- [ ] Basic metadata enrichment
- [ ] Unit tests cho core components

**Dependencies:**
- LangChain.js loaders installed
- Test files prepared (PDF, DOCX, TXT samples)

---

### Phase 2: Content Normalization & Code Support (Tuần 2)

**Deliverables:**
- [ ] Code file parsing (language detection)
- [ ] Content normalization logic (whitespace, encoding, line endings)
- [ ] Enhanced metadata enrichment (word count, timestamps)
- [ ] Partial parsing support cho PDFs
- [ ] Comprehensive error handling
- [ ] Integration tests với real files

**Dependencies:**
- Phase 1 completed
- Large test files available

---

### Phase 3: Performance & Error Handling (Tuần 3)

**Deliverables:**
- [ ] Timeout protection
- [ ] Memory management cho large files
- [ ] Retry logic với backoff
- [ ] Performance optimization
- [ ] Memory profiling
- [ ] Stress testing

**Dependencies:**
- Phase 2 completed
- Monitoring tools available

---

### Phase 4: Integration & Polish (Tuần 4)

**Deliverables:**
- [ ] LangGraph workflow integration
- [ ] Structured logging
- [ ] Metrics collection
- [ ] Error documentation
- [ ] API documentation
- [ ] End-to-end testing với Load stage

**Dependencies:**
- Load stage completed
- LangGraph workflow skeleton ready

---

## Phụ thuộc & Rủi ro

### External Dependencies

| Dependency | Purpose | Risk | Mitigation |
|------------|---------|------|------------|
| LangChain.js | Document loaders | API changes | Pin version, monitor releases |
| pdf-parse | PDF parsing | Parsing failures | Fallback mechanisms, partial parsing |
| mammoth | DOCX parsing | Limited formatting | Accept plain text output |
| chardet | Encoding detection | False detection | Fallback to UTF-8 |

### Technical Risks

| Rủi ro | Xác suất | Tác động | Giảm thiểu |
|--------|----------|---------|------------|
| Complex PDFs fail to parse | Cao | Trung bình | Partial parsing, page-by-page fallback |
| Memory overflow với large files | Trung bình | Cao | Streaming, resource limits, timeout |
| Encoding detection failures | Thấp | Thấp | Fallback to UTF-8, configurable encoding |
| Parser library bugs | Thấp | Cao | Comprehensive testing, version pinning |
| Inconsistent output formats | Trung bình | Cao | Normalization logic, strict validation |

### Business Risks

| Rủi ro | Xác suất | Tác động | Giảm thiểu |
|--------|----------|---------|------------|
| Unsupported file types | Cao | Trung bình | Clear documentation, graceful rejection |
| Poor quality extracted text | Trung bình | Cao | Quality validation, user feedback |
| Slow parsing times | Trung bình | Cao | Performance optimization, caching |

---

## Phụ lục

### Phụ lục A: Supported File Types

| Extension | MIME Type | Parser | Max Size | Notes |
|-----------|-----------|--------|----------|-------|
| .pdf | application/pdf | PDFLoader | 100MB | Không hỗ trợ password-protected |
| .docx | application/vnd.openxmlformats-officedocument.wordprocessingml.document | DocxLoader | 50MB | Tables → plain text |
| .txt | text/plain | TextLoader | 10MB | Auto encoding detection |
| .md | text/markdown | TextLoader | 10MB | Structure preserved |
| .py | text/x-python | TextLoader | 5MB | Syntax preserved |
| .js | text/javascript | TextLoader | 5MB | Syntax preserved |
| .ts | text/x-typescript | TextLoader | 5MB | Syntax preserved |
| .java | text/x-java-source | TextLoader | 5MB | Syntax preserved |
| .cpp | text/x-c++src | TextLoader | 5MB | Syntax preserved |

### Phụ lục B: Error Codes Reference

| Code | Type | HTTP | Description | User Action |
|------|------|------|-------------|-------------|
| PARSE_UNSUPPORTED_FORMAT | Permanent | 400 | File type không được hỗ trợ | Upload file khác định dạng |
| PARSE_CORRUPTED_FILE | Permanent | 400 | File bị hỏng | Re-upload file |
| PARSE_PASSWORD_PROTECTED | Permanent | 400 | PDF có password | Remove password hoặc upload unlocked version |
| PARSE_EMPTY_FILE | Permanent | 400 | File không có nội dung | Upload file có nội dung |
| PARSE_TIMEOUT | Temporary | 500 | Parser timeout | File quá lớn, contact admin |
| PARSE_MEMORY_EXCEEDED | Temporary | 500 | Out of memory | File quá phức tạp, contact admin |
| PARSE_ENCODING_ERROR | Temporary | 500 | Lỗi encoding | Check file encoding, try UTF-8 |
| PARSE_PARTIAL_SUCCESS | Partial | 200 | Một phần parse được | Some content may be missing |

### Phụ lục C: LangChain Document Standard

```typescript
// LangChain Document Interface
interface Document {
  pageContent: string;  // Main text content
  metadata: {
    source: string;  // Required: Source file path
    [key: string]: unknown;  // Additional metadata
  };
  id?: string;  // Optional unique identifier
}

// Example PDF Document
{
  pageContent: "This is the text content of page 1...",
  metadata: {
    source: "/tmp/indexing/job-123/file-456.pdf",
    fileId: "file-456",
    filename: "report.pdf",
    documentType: "pdf",
    loc: { pageNumber: 1 },
    pdf: {
      version: "1.7",
      totalPages: 100
    },
    characterCount: 1234,
    parsedAt: "2025-11-03T10:30:00Z"
  }
}

// Example DOCX Document
{
  pageContent: "Full document content with structure...",
  metadata: {
    source: "/tmp/indexing/job-123/file-789.docx",
    fileId: "file-789",
    filename: "contract.docx",
    documentType: "docx",
    wordCount: 5678,
    paragraphCount: 45,
    parsedAt: "2025-11-03T10:31:00Z"
  }
}
```

### Phụ lục D: Configuration Reference

```typescript
interface ParseStageConfig {
  // Parser settings
  parsers: {
    pdf: {
      splitPages: boolean;  // Default: true
      parsedItemSeparator: string;  // Default: ' '
      maxPages: number;  // Default: 1000
    };
    docx: {
      preserveFormatting: boolean;  // Default: false
    };
    text: {
      encodingDetection: boolean;  // Default: true
      defaultEncoding: string;  // Default: 'utf-8'
      normalizeLineEndings: boolean;  // Default: true
    };
  };

  // Performance
  performance: {
    timeoutMs: number;  // Default: 300000 (5 minutes)
    maxMemoryMB: number;  // Default: 500
    concurrentParsing: number;  // Default: 3
  };

  // Error handling
  errorHandling: {
    allowPartialSuccess: boolean;  // Default: true
    partialSuccessThreshold: number;  // Default: 0.8 (80%)
    retryCount: number;  // Default: 2
    retryDelayMs: number;  // Default: 30000 (30s)
  };

  // Metadata
  metadata: {
    enrichmentEnabled: boolean;  // Default: true
    structureDetection: boolean;  // Default: true
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

## Ghi chú quan trọng

### Nguyên tắc thiết kế Parse Stage

**Parse Stage chỉ làm một việc: Extract text từ files**

1. **Trong phạm vi:**
   - ✅ Chuyển binary files → plain text
   - ✅ Phát hiện encoding và normalize content
   - ✅ Thêm metadata cơ bản (file info, page numbers, word count)
   - ✅ Đảm bảo output nhất quán (LangChain Document format)

2. **Ngoài phạm vi (→ Structure Stage):**
   - ❌ Phân tích heading hierarchy
   - ❌ Detect sections và subsections
   - ❌ Extract tables với structure
   - ❌ Parse code functions/classes
   - ❌ Build document tree

3. **Lý do tách biệt:**
   - **Single Responsibility:** Mỗi stage chỉ làm một việc và làm tốt
   - **Testability:** Dễ test khi scope rõ ràng
   - **Maintainability:** Dễ debug và maintain
   - **Flexibility:** Structure Stage có thể thay đổi logic mà không ảnh hưởng Parse Stage

---

**Trạng thái tài liệu:** Nháp (Simplified)
**Xem xét tiếp theo:** 2025-11-10
**Lịch sử phiên bản:**
- v1.0 (2025-11-03): Tạo Parse Stage implementation plan ban đầu (tiếng Việt)
- v1.1 (2025-11-03): Simplified - Loại bỏ structure detection logic, chỉ tập trung vào text extraction

---

**Kết thúc tài liệu**
