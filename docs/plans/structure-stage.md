# Kế Hoạch Triển Khai Structure Stage

**Phiên bản:** 1.0
**Cập nhật lần cuối:** 2025-11-03
**Trạng thái:** Nháp
**Giai đoạn:** 3/7 (Structure)

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

Structure Stage là giai đoạn thứ ba của pipeline indexing, chịu trách nhiệm **phân tích và xây dựng cấu trúc phân cấp của tài liệu**. Giai đoạn này nhận văn bản thuần từ Parse Stage và phát hiện cấu trúc ngữ nghĩa (headings, sections, subsections) để tối ưu hóa cho việc chunking.

**Vị trí trong pipeline:**
```
Load → Parse → Structure → Chunk → Enrich → Embed → Persist
                  ^^^^
              (Giai đoạn này)
```

**Nhiệm vụ chính:** Chuyển đổi từ "flat text" → "hierarchical document tree"

### Phạm vi

**Trong phạm vi:**
- Phát hiện headings từ văn bản (Markdown ##, PDF bold + size, Word styles)
- Xây dựng cấu trúc cây phân cấp (Document → Sections → Subsections)
- Giữ nguyên metadata từ Parse stage (page numbers, line numbers)
- Phát hiện boundaries tự nhiên cho chunking tối ưu
- Tạo section paths cho navigation (e.g., "Chapter 1 > Section 1.1")
- **Chỉ xử lý structure, không chunk text** (→ Chunk Stage)
- **Thuật toán-based detection, không dùng LLM** (chi phí và độ trễ thấp)

**Ngoài phạm vi:**
- Chunking documents (→ Chunk Stage)
- Trích xuất entities (→ Enrich Stage)
- Trích xuất tables với structure phức tạp (future enhancement)
- OCR hoặc layout analysis cho scanned documents
- Semantic clustering dựa trên embeddings
- Dịch đa ngôn ngữ
- Tóm tắt sections (→ Enrich Stage nếu cần)

### Giá trị nghiệp vụ

1. **Chunking tốt hơn:** Cấu trúc rõ ràng giúp Chunk Stage chia theo semantic boundaries
2. **Context preservation:** Giữ nguyên hierarchical context (chapter, section, subsection)
3. **Navigation:** Hỗ trợ người dùng navigate qua document outline
4. **Retrieval accuracy:** Metadata structure giúp filter và rank results chính xác hơn
5. **Scalable:** Thuật toán-based approach hoạt động với mọi document size

---

## Yêu cầu nghiệp vụ

### YN-1: Phát hiện Document Structure

**Ưu tiên:** P0 (Quan trọng)

**Mô tả:** Hệ thống phải phát hiện cấu trúc phân cấp của tài liệu từ các patterns văn bản.

**Tiêu chí chấp nhận:**
- **Markdown:** Phát hiện headers (`#`, `##`, `###`, etc.) với đúng level
- **PDF:**
  - Phát hiện bold + larger font size như headings
  - Phát hiện ALL CAPS text như headings
  - Xử lý nested hierarchy (Chapter → Section → Subsection)
- **DOCX:**
  - Phát hiện Word heading styles (Heading 1, Heading 2, etc.)
  - Phát hiện bold + font size patterns
- **Code:**
  - Phát hiện top-level structures (file header, imports, classes, functions)
  - Giữ nguyên code structure hierarchy
- **Phát hiện tối đa 6 levels** (H1 → H6 hoặc tương đương)
- **Fallback:** Nếu không detect được structure, treat entire document as flat (one section)

**Tác động nghiệp vụ:**
- Cho phép chunking theo semantic boundaries thay vì arbitrary split
- Users có thể navigate qua document outline
- Retrieval có thể filter theo sections

---

### YN-2: Xây dựng Document Tree

**Ưu tiên:** P0 (Quan trọng)

**Mô tả:** Hệ thống phải xây dựng cấu trúc cây đại diện cho document hierarchy.

**Tiêu chí chấp nhận:**
- **Cấu trúc cây:**
  - Root node: Document
  - Internal nodes: Sections với level (1-6)
  - Leaf nodes: Text content
- **Relationships:**
  - Parent-child relationships rõ ràng
  - Siblings theo thứ tự xuất hiện
- **Metadata:**
  - Section title
  - Section level (depth)
  - Page number (nếu có)
  - Line number range
  - Character offset range
- **Validation:**
  - Không có orphan nodes
  - Hierarchy hợp lệ (level không nhảy quá 1 bậc, e.g., H1 → H3 không hợp lệ)
  - Auto-correct hierarchy nếu cần (H1 → H3 → H2 becomes H1 → H2 → H3)

**Tác động nghiệp vụ:**
- Cung cấp structured representation cho downstream processing
- Dễ dàng serialize thành JSON cho storage hoặc API
- Hỗ trợ analytics về document structure

---

### YN-3: Section Path Generation

**Ưu tiên:** P1 (Cao)

**Mô tả:** Hệ thống phải tạo "breadcrumb paths" cho mỗi section để navigation và display.

**Tiêu chí chấp nhận:**
- **Format:** `Root > Section 1 > Subsection 1.1`
- **Ví dụ:**
  - `Introduction > Background > History`
  - `Chapter 3 > Section 3.2 > Example 3.2.1`
- **Tự động numbering:** Nếu sections không có số, tự động đánh số (1, 1.1, 1.2, 2, 2.1, etc.)
- **Max path length:** 200 characters (truncate nếu cần)
- **Lưu vào metadata** cho mỗi section

**Tác động nghiệp vụ:**
- Users dễ dàng hiểu context của chunk
- Frontend có thể render breadcrumbs
- Search results có thể hiển thị "where in document"

---

### YN-4: Boundary Detection cho Chunking

**Ưu tiên:** P0 (Quan trọng)

**Mô tả:** Hệ thống phải xác định ranh giới tự nhiên để Chunk Stage có thể chunk theo semantic units.

**Tiêu chí chấp nhận:**
- **Phát hiện boundaries:**
  - Section boundaries (headings)
  - Paragraph boundaries (`\n\n`)
  - Sentence boundaries (`. ` with capitalization)
  - List item boundaries
- **Mark boundaries với metadata:**
  - `boundary_type`: 'section', 'paragraph', 'sentence'
  - `boundary_strength`: 'strong' (section), 'medium' (paragraph), 'weak' (sentence)
- **Thứ tự ưu tiên:** Section > Paragraph > Sentence > Character
- **Chunk Stage sẽ ưu tiên split tại boundaries mạnh hơn**

**Tác động nghiệp vụ:**
- Chunks có semantic coherence cao hơn
- Giảm "broken thoughts" trong chunks
- Cải thiện retrieval quality

---

### YN-5: Xử lý Documents không có Structure

**Ưu tiên:** P0 (Quan trọng)

**Mô tả:** Hệ thống phải xử lý gracefully các documents không có headings rõ ràng.

**Tiêu chí chấp nhận:**
- **Phát hiện "flat documents":**
  - Plain text files không có markdown
  - PDFs với uniform formatting (no bold, no size changes)
  - Code files mà không có clear structure
- **Fallback strategy:**
  - Tạo một single section với title = filename
  - Level = 1 (root level)
  - Content = toàn bộ text
  - Mark document với `structured: false` metadata
- **Log warning:** "No structure detected, treating as flat document"
- **Không fail job:** Proceed với flat structure

**Tác động nghiệp vụ:**
- Hệ thống robust với mọi loại document
- Không reject documents chỉ vì thiếu structure
- Vẫn có thể index và retrieve content

---

## Đặc tả chức năng

### ĐC-1: Heading Detection

**Mục đích:** Phát hiện headings từ text với patterns khác nhau theo file type

**Đầu vào:**
```typescript
interface HeadingDetectionInput {
  documents: Document[];  // LangChain Documents từ Parse Stage
  fileType: 'pdf' | 'docx' | 'text' | 'code' | 'markdown';
  metadata: {
    fileId: string;
    filename: string;
  };
}
```

**Quy trình:**

**1. Markdown Detection:**
```typescript
// Pattern: ## Heading Text
const markdownHeadingRegex = /^(#{1,6})\s+(.+)$/gm;

function detectMarkdownHeadings(text: string): Heading[] {
  const headings: Heading[] = [];
  let match;

  while ((match = markdownHeadingRegex.exec(text)) !== null) {
    const level = match[1].length;  // Count #
    const title = match[2].trim();
    const offset = match.index;

    headings.push({
      level,
      title,
      startOffset: offset,
      endOffset: offset + match[0].length,
      type: 'markdown',
    });
  }

  return headings;
}
```

**2. PDF Bold + Size Detection:**
```typescript
// Giả định Parse stage đã extract font metadata
interface TextRun {
  text: string;
  isBold: boolean;
  fontSize: number;
  offset: number;
}

function detectPDFHeadings(textRuns: TextRun[]): Heading[] {
  const headings: Heading[] = [];

  // Tính average font size
  const avgSize = calculateAverageSize(textRuns);

  // Detect headings: bold AND size > avg
  for (const run of textRuns) {
    if (run.isBold && run.fontSize > avgSize * 1.2) {
      // Estimate level based on font size
      const level = estimateLevel(run.fontSize, avgSize);

      headings.push({
        level,
        title: run.text.trim(),
        startOffset: run.offset,
        type: 'pdf-bold-size',
      });
    }
  }

  return headings;
}

function estimateLevel(fontSize: number, avgSize: number): number {
  const ratio = fontSize / avgSize;

  if (ratio >= 2.0) return 1;      // H1: 2x average
  if (ratio >= 1.7) return 2;      // H2: 1.7x average
  if (ratio >= 1.4) return 3;      // H3: 1.4x average
  if (ratio >= 1.2) return 4;      // H4: 1.2x average
  return 5;                        // H5+
}
```

**3. ALL CAPS Detection (Fallback):**
```typescript
// Patterns: "CHAPTER 1: INTRODUCTION" hoặc "1. INTRODUCTION"
const allCapsHeadingRegex = /^([A-Z][A-Z\s0-9:.-]{2,})$/gm;

function detectAllCapsHeadings(text: string): Heading[] {
  const headings: Heading[] = [];
  let match;

  while ((match = allCapsHeadingRegex.exec(text)) !== null) {
    const title = match[1].trim();

    // Validate: phải ngắn hơn 200 chars (avoid detecting full caps paragraphs)
    if (title.length < 200) {
      headings.push({
        level: estimateLevelFromText(title),
        title,
        startOffset: match.index,
        type: 'all-caps',
      });
    }
  }

  return headings;
}

function estimateLevelFromText(title: string): number {
  // "CHAPTER" → Level 1
  if (/^CHAPTER\s+\d+/.test(title)) return 1;

  // "SECTION" → Level 2
  if (/^SECTION\s+\d+/.test(title)) return 2;

  // "1.1" → Level based on dots
  const dotCount = (title.match(/\./g) || []).length;
  return Math.min(dotCount + 1, 6);
}
```

**4. DOCX Heading Styles:**
```typescript
// Giả định Parse stage đã extract Word style metadata
interface DocxParagraph {
  text: string;
  style: string;  // 'Heading 1', 'Heading 2', etc.
  offset: number;
}

function detectDocxHeadings(paragraphs: DocxParagraph[]): Heading[] {
  const headings: Heading[] = [];

  for (const para of paragraphs) {
    const match = /Heading (\d+)/.exec(para.style);
    if (match) {
      const level = parseInt(match[1], 10);

      headings.push({
        level,
        title: para.text.trim(),
        startOffset: para.offset,
        type: 'docx-style',
      });
    }
  }

  return headings;
}
```

**5. Code Structure Detection:**
```typescript
// Python example
const pythonClassRegex = /^class\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
const pythonFunctionRegex = /^def\s+([A-Za-z_][A-Za-z0-9_]*)/gm;

function detectCodeHeadings(code: string, language: string): Heading[] {
  const headings: Heading[] = [];

  if (language === 'python') {
    // File header (docstring at top)
    const docstringMatch = /^"""(.+?)"""/s.exec(code);
    if (docstringMatch) {
      headings.push({
        level: 1,
        title: 'File Header',
        startOffset: 0,
        type: 'code-docstring',
      });
    }

    // Classes → Level 2
    let match;
    while ((match = pythonClassRegex.exec(code)) !== null) {
      headings.push({
        level: 2,
        title: `Class: ${match[1]}`,
        startOffset: match.index,
        type: 'code-class',
      });
    }

    // Functions → Level 3
    while ((match = pythonFunctionRegex.exec(code)) !== null) {
      headings.push({
        level: 3,
        title: `Function: ${match[1]}`,
        startOffset: match.index,
        type: 'code-function',
      });
    }
  }

  // Similar logic for JavaScript, TypeScript, Java, etc.

  return headings;
}
```

**Đầu ra:**
```typescript
interface Heading {
  level: number;           // 1-6
  title: string;
  startOffset: number;     // Character offset in text
  endOffset?: number;
  type: 'markdown' | 'pdf-bold-size' | 'all-caps' | 'docx-style' | 'code-class' | 'code-function';
  metadata?: Record<string, unknown>;
}

interface HeadingDetectionOutput {
  headings: Heading[];
  confidence: 'high' | 'medium' | 'low';  // Based on detection method
  hasStructure: boolean;
}
```

**Quy tắc nghiệp vụ:**
- Nếu không detect được headings → `hasStructure: false`, `headings: []`
- Confidence:
  - `high`: Markdown #, DOCX styles
  - `medium`: PDF bold+size
  - `low`: ALL CAPS patterns
- Validate headings: title length 1-200 chars, level 1-6

---

### ĐC-2: Document Tree Construction

**Mục đích:** Xây dựng cây phân cấp từ danh sách headings

**Đầu vào:**
```typescript
interface TreeConstructionInput {
  documents: Document[];  // Original documents
  headings: Heading[];    // Detected headings
  fileId: string;
  filename: string;
}
```

**Quy trình:**

**1. Tạo Document Root:**
```typescript
interface DocumentNode {
  id: string;
  type: 'document' | 'section';
  title: string;
  level: number;
  content: string;
  children: DocumentNode[];
  metadata: SectionMetadata;
}

interface SectionMetadata {
  sectionPath: string;
  pageNumber?: number;
  lineNumberStart?: number;
  lineNumberEnd?: number;
  offsetStart: number;
  offsetEnd: number;
  wordCount: number;
}

function createDocumentTree(input: TreeConstructionInput): DocumentNode {
  // Root node
  const root: DocumentNode = {
    id: input.fileId,
    type: 'document',
    title: input.filename,
    level: 0,
    content: '',
    children: [],
    metadata: {
      sectionPath: input.filename,
      offsetStart: 0,
      offsetEnd: getTotalLength(input.documents),
      wordCount: 0,
    },
  };

  // Build tree
  buildTree(root, input.headings, input.documents);

  return root;
}
```

**2. Build Tree với Stack Algorithm:**
```typescript
function buildTree(
  root: DocumentNode,
  headings: Heading[],
  documents: Document[]
): void {
  const stack: DocumentNode[] = [root];
  const fullText = documents.map(d => d.pageContent).join('\n');

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextHeading = headings[i + 1];

    // Extract section content (from this heading to next)
    const startOffset = heading.startOffset;
    const endOffset = nextHeading ? nextHeading.startOffset : fullText.length;
    const content = fullText.slice(startOffset, endOffset).trim();

    // Create section node
    const section: DocumentNode = {
      id: `${root.id}_section_${i}`,
      type: 'section',
      title: heading.title,
      level: heading.level,
      content,
      children: [],
      metadata: {
        sectionPath: '',  // Will be calculated later
        offsetStart: startOffset,
        offsetEnd: endOffset,
        wordCount: countWords(content),
      },
    };

    // Find correct parent using stack
    // Pop stack until we find a parent with level < current level
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    // Add as child to current top of stack
    const parent = stack[stack.length - 1];
    parent.children.push(section);

    // Push current section onto stack
    stack.push(section);
  }
}
```

**3. Hierarchy Validation & Auto-Correction:**
```typescript
function validateAndCorrectHierarchy(root: DocumentNode): void {
  function traverse(node: DocumentNode, expectedLevel: number): void {
    // Correct level if needed
    if (node.level > expectedLevel + 1) {
      console.warn(
        `Invalid hierarchy: ${node.title} (level ${node.level}) ` +
        `should be ${expectedLevel + 1}. Auto-correcting.`
      );
      node.level = expectedLevel + 1;
    }

    // Traverse children
    for (const child of node.children) {
      traverse(child, node.level);
    }
  }

  traverse(root, 0);
}
```

**4. Section Path Generation:**
```typescript
function generateSectionPaths(root: DocumentNode): void {
  function traverse(node: DocumentNode, parentPath: string): void {
    // Generate path
    node.metadata.sectionPath = parentPath
      ? `${parentPath} > ${node.title}`
      : node.title;

    // Traverse children
    for (const child of node.children) {
      traverse(child, node.metadata.sectionPath);
    }
  }

  traverse(root, '');
}
```

**Đầu ra:**
```typescript
interface TreeConstructionOutput {
  documentTree: DocumentNode;
  statistics: {
    totalSections: number;
    maxDepth: number;
    averageDepth: number;
  };
}
```

**Ví dụ Output:**
```json
{
  "documentTree": {
    "id": "file-123",
    "type": "document",
    "title": "report.pdf",
    "level": 0,
    "content": "",
    "children": [
      {
        "id": "file-123_section_0",
        "type": "section",
        "title": "Introduction",
        "level": 1,
        "content": "This report covers...",
        "children": [
          {
            "id": "file-123_section_1",
            "type": "section",
            "title": "Background",
            "level": 2,
            "content": "In 2024, we observed...",
            "children": [],
            "metadata": {
              "sectionPath": "report.pdf > Introduction > Background",
              "offsetStart": 120,
              "offsetEnd": 450,
              "wordCount": 65
            }
          }
        ],
        "metadata": {
          "sectionPath": "report.pdf > Introduction",
          "offsetStart": 0,
          "offsetEnd": 450,
          "wordCount": 120
        }
      }
    ],
    "metadata": {...}
  },
  "statistics": {
    "totalSections": 15,
    "maxDepth": 4,
    "averageDepth": 2.3
  }
}
```

---

### ĐC-3: Boundary Detection

**Mục đích:** Phát hiện semantic boundaries để hỗ trợ chunking tối ưu

**Đầu vào:**
```typescript
interface BoundaryDetectionInput {
  documentTree: DocumentNode;
  documents: Document[];
}
```

**Quy trình:**

**1. Detect Section Boundaries:**
```typescript
// Section boundaries đã được xác định trong tree construction
// Mỗi DocumentNode có startOffset và endOffset
```

**2. Detect Paragraph Boundaries:**
```typescript
function detectParagraphBoundaries(text: string): Boundary[] {
  const boundaries: Boundary[] = [];

  // Double newline = paragraph boundary
  const paragraphRegex = /\n\n+/g;
  let match;

  while ((match = paragraphRegex.exec(text)) !== null) {
    boundaries.push({
      type: 'paragraph',
      offset: match.index,
      strength: 'medium',
    });
  }

  return boundaries;
}
```

**3. Detect Sentence Boundaries:**
```typescript
function detectSentenceBoundaries(text: string): Boundary[] {
  const boundaries: Boundary[] = [];

  // Pattern: ". " followed by capital letter or number
  const sentenceRegex = /\.\s+(?=[A-Z0-9])/g;
  let match;

  while ((match = sentenceRegex.exec(text)) !== null) {
    boundaries.push({
      type: 'sentence',
      offset: match.index + 1,  // After the period
      strength: 'weak',
    });
  }

  return boundaries;
}
```

**4. Annotate Document Tree với Boundaries:**
```typescript
function annotateBoundaries(
  documentTree: DocumentNode,
  fullText: string
): AnnotatedDocumentNode {
  const paragraphBoundaries = detectParagraphBoundaries(fullText);
  const sentenceBoundaries = detectSentenceBoundaries(fullText);

  function traverse(node: DocumentNode): AnnotatedDocumentNode {
    // Find boundaries within this section
    const sectionBoundaries = [
      ...paragraphBoundaries.filter(
        b => b.offset >= node.metadata.offsetStart &&
             b.offset < node.metadata.offsetEnd
      ),
      ...sentenceBoundaries.filter(
        b => b.offset >= node.metadata.offsetStart &&
             b.offset < node.metadata.offsetEnd
      ),
    ];

    // Sort by offset
    sectionBoundaries.sort((a, b) => a.offset - b.offset);

    return {
      ...node,
      boundaries: sectionBoundaries,
      children: node.children.map(traverse),
    };
  }

  return traverse(documentTree);
}
```

**Đầu ra:**
```typescript
interface Boundary {
  type: 'section' | 'paragraph' | 'sentence';
  offset: number;
  strength: 'strong' | 'medium' | 'weak';
}

interface AnnotatedDocumentNode extends DocumentNode {
  boundaries: Boundary[];
  children: AnnotatedDocumentNode[];
}

interface BoundaryDetectionOutput {
  annotatedTree: AnnotatedDocumentNode;
  boundaryStats: {
    totalSections: number;
    totalParagraphs: number;
    totalSentences: number;
  };
}
```

---

### ĐC-4: Flatten Tree cho Chunk Stage

**Mục đích:** Chuyển đổi hierarchical tree thành flat list of sections để Chunk Stage xử lý

**Đầu vào:**
```typescript
interface FlattenInput {
  annotatedTree: AnnotatedDocumentNode;
}
```

**Quy trình:**
```typescript
function flattenTree(tree: AnnotatedDocumentNode): FlatSection[] {
  const sections: FlatSection[] = [];

  function traverse(node: AnnotatedDocumentNode): void {
    // Skip root document node
    if (node.type === 'section') {
      sections.push({
        id: node.id,
        title: node.title,
        level: node.level,
        content: node.content,
        sectionPath: node.metadata.sectionPath,
        boundaries: node.boundaries,
        metadata: node.metadata,
      });
    }

    // Traverse children
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(tree);

  return sections;
}
```

**Đầu ra:**
```typescript
interface FlatSection {
  id: string;
  title: string;
  level: number;
  content: string;
  sectionPath: string;
  boundaries: Boundary[];
  metadata: SectionMetadata;
}

interface FlattenOutput {
  sections: FlatSection[];
  statistics: {
    totalSections: number;
    averageWordCount: number;
    largestSection: string;
  };
}
```

**Ví dụ:**
```json
{
  "sections": [
    {
      "id": "file-123_section_0",
      "title": "Introduction",
      "level": 1,
      "content": "This report covers...",
      "sectionPath": "report.pdf > Introduction",
      "boundaries": [
        { "type": "paragraph", "offset": 50, "strength": "medium" },
        { "type": "sentence", "offset": 100, "strength": "weak" }
      ],
      "metadata": {
        "sectionPath": "report.pdf > Introduction",
        "offsetStart": 0,
        "offsetEnd": 450,
        "wordCount": 120
      }
    },
    {
      "id": "file-123_section_1",
      "title": "Background",
      "level": 2,
      "content": "In 2024, we observed...",
      "sectionPath": "report.pdf > Introduction > Background",
      "boundaries": [...],
      "metadata": {...}
    }
  ],
  "statistics": {
    "totalSections": 15,
    "averageWordCount": 85,
    "largestSection": "file-123_section_5"
  }
}
```

---

## Phương pháp kỹ thuật

### Kiến trúc thành phần

```
StructureStage
├── StructureService (Orchestrator)
│   ├── Điều phối structure detection workflow
│   ├── Coordinate detectors và tree builders
│   └── Error handling
│
├── Heading Detectors
│   ├── MarkdownHeadingDetector
│   │   └── Detect ## patterns
│   ├── PDFHeadingDetector
│   │   └── Detect bold + font size
│   ├── AllCapsHeadingDetector
│   │   └── Detect ALL CAPS patterns
│   ├── DocxHeadingDetector
│   │   └── Detect Word styles
│   └── CodeHeadingDetector
│       └── Detect code structure (class, function)
│
├── Document Tree Builder
│   ├── TreeConstructor
│   │   └── Build hierarchical tree từ headings
│   ├── HierarchyValidator
│   │   └── Validate và auto-correct levels
│   └── SectionPathGenerator
│       └── Generate breadcrumb paths
│
├── Boundary Detector
│   ├── ParagraphBoundaryDetector
│   │   └── Detect \n\n patterns
│   └── SentenceBoundaryDetector
│       └── Detect ". " patterns
│
└── Tree Flattener
    └── Flatten hierarchical tree thành flat list
```

### Technology Stack

**Core Dependencies:**
- **LangChain.js Documents** - Input format từ Parse Stage
- **Native TypeScript** - Regex và string processing
- **No LLM dependencies** - Thuật toán-based approach

**Utilities:**
- `uuid` - Generate section IDs
- Native `String` methods - Text manipulation
- Regex patterns - Heading detection

---

## Điểm tích hợp

### 1. Parse Stage (Input)

**Protocol:** LangGraph state transition

**Input State:**
```typescript
{
  parsedDocs: Document[];  // LangChain Documents
  parseMetadata: {
    fileId: string;
    filename: string;
    parserType: 'pdf' | 'docx' | 'text' | 'code' | 'markdown';
    documentCount: number;
    totalCharacters: number;
  };
  currentStage: 'parse';
}
```

**What Structure Stage needs:**
- `parsedDocs` - Text content to analyze
- `parseMetadata.parserType` - Để chọn heading detector phù hợp
- `parseMetadata.fileId` và `filename` - Để tạo document tree

---

### 2. Chunk Stage (Output)

**Protocol:** LangGraph state transition

**Output State:**
```typescript
{
  ...inputState,
  structuredDoc: StructuredDocument;
  structureMetadata: {
    hasStructure: boolean;
    totalSections: number;
    maxDepth: number;
    detectionMethod: string;
    processingTime: number;
  };
  currentStage: 'structure';
  errors: string[];
}
```

**StructuredDocument Format:**
```typescript
interface StructuredDocument {
  id: string;  // fileId
  title: string;  // filename
  sections: FlatSection[];
  metadata: {
    totalSections: number;
    averageWordCount: number;
    hasStructure: boolean;
  };
}
```

**How Chunk Stage uses this:**
- `sections` - Chunk mỗi section riêng biệt
- `sections[].boundaries` - Ưu tiên split tại boundaries
- `sections[].sectionPath` - Thêm vào chunk metadata
- `hasStructure: false` → Chunk toàn bộ document như một khối

---

## Luồng dữ liệu

### Happy Path

```
1. Structure Stage bắt đầu với state từ Parse Stage
   ↓
2. StructureService.execute(state)
   ↓
3. Validate input (parsedDocs không empty)
   ↓
4. Select appropriate heading detector based on parserType
   ↓ (detector: MarkdownHeadingDetector | PDFHeadingDetector | ...)
5. detector.detect(parsedDocs)
   ↓ (headings: Heading[])
6. Check if headings detected
   ↓
   ├─ YES: hasStructure = true
   │   ↓
   │   7. TreeConstructor.buildTree(headings, parsedDocs)
   │      ↓ (documentTree: DocumentNode)
   │   8. HierarchyValidator.validate(documentTree)
   │      ↓ (corrected tree)
   │   9. SectionPathGenerator.generate(documentTree)
   │      ↓ (tree with paths)
   │   10. BoundaryDetector.detect(documentTree)
   │       ↓ (annotatedTree: AnnotatedDocumentNode)
   │   11. TreeFlattener.flatten(annotatedTree)
   │       ↓ (sections: FlatSection[])
   │
   └─ NO: hasStructure = false
       ↓
       7. Create single flat section with entire content
          ↓ (sections: [FlatSection])
12. Create StructuredDocument
    ↓
13. Update workflow state với structuredDoc
    ↓
14. Transition sang Chunk Stage
```

### Error Path - No Parse Docs

```
1. StructureService.execute(state)
   ↓
2. Validate input
   ↓ (parsedDocs is empty)
3. Throw EmptyInputError
   ↓
4. Return error cho workflow
   ↓
5. Workflow đánh dấu job as failed
```

### Edge Case - Heading Detection Fails

```
1-5. (Same as happy path)
   ↓
6. detector.detect() returns empty array
   ↓
7. Log warning: "No structure detected for {filename}"
   ↓
8. Create fallback StructuredDocument:
   - Single section với title = filename
   - Content = toàn bộ text
   - hasStructure = false
   ↓
9. Proceed với flat structure
   ↓
10. Chunk Stage sẽ chunk toàn bộ như một khối
```

---

## Chiến lược xử lý lỗi

### Phân loại lỗi

#### Lỗi vĩnh viễn (Không Retry)
**Đặc điểm:** Lỗi về input data

**Loại lỗi:**
- `EMPTY_INPUT`: Không có parsedDocs từ Parse Stage
- `INVALID_FORMAT`: Document format không hợp lệ

**Xử lý:**
- Log error với full context
- Fail job ngay lập tức
- Return error message rõ ràng

---

#### Lỗi có thể recover (Fallback)
**Đặc điểm:** Structure detection fails nhưng có thể tiếp tục

**Loại lỗi:**
- `NO_STRUCTURE_DETECTED`: Không phát hiện được headings
- `HIERARCHY_INVALID`: Hierarchy không hợp lệ nhưng có thể correct

**Xử lý:**
- Log warning
- Fallback sang flat structure
- Set `hasStructure: false`
- Continue processing
- Chunk Stage sẽ xử lý như flat document

**Fallback Logic:**
```typescript
async function executeWithFallback(input: StructureInput): Promise<StructuredDocument> {
  try {
    // Attempt structure detection
    const headings = await detector.detect(input.parsedDocs);

    if (headings.length === 0) {
      throw new NoStructureDetectedError('No headings found');
    }

    // Build tree
    const tree = await buildTree(headings, input.parsedDocs);
    return tree;

  } catch (error) {
    if (error instanceof NoStructureDetectedError) {
      logger.warn(`Structure detection failed for ${input.fileId}. Using flat fallback.`);

      // Create flat structure
      return createFlatStructure(input.parsedDocs, input.fileId, input.filename);
    }

    // Re-throw other errors
    throw error;
  }
}

function createFlatStructure(
  documents: Document[],
  fileId: string,
  filename: string
): StructuredDocument {
  const fullText = documents.map(d => d.pageContent).join('\n\n');

  return {
    id: fileId,
    title: filename,
    sections: [
      {
        id: `${fileId}_section_0`,
        title: filename,
        level: 1,
        content: fullText,
        sectionPath: filename,
        boundaries: [],
        metadata: {
          sectionPath: filename,
          offsetStart: 0,
          offsetEnd: fullText.length,
          wordCount: countWords(fullText),
        },
      },
    ],
    metadata: {
      totalSections: 1,
      averageWordCount: countWords(fullText),
      hasStructure: false,
    },
  };
}
```

---

### Error Response Format

```typescript
interface StructureErrorResponse {
  stage: 'structure';
  errorCode: string;
  errorType: 'permanent' | 'recoverable';
  message: string;
  details: {
    fileId: string;
    filename: string;
    parserType: string;
    originalError: string;
    timestamp: Date;
  };
  fallbackApplied: boolean;
  recommendedAction: string;
}
```

**Error Codes:**

| Code | Type | Description | Fallback |
|------|------|-------------|----------|
| STRUCTURE_EMPTY_INPUT | Permanent | Không có parsedDocs | Không |
| STRUCTURE_NO_HEADINGS | Recoverable | Không detect được headings | Có (flat) |
| STRUCTURE_INVALID_HIERARCHY | Recoverable | Hierarchy không hợp lệ | Có (auto-correct) |

---

## Yêu cầu hiệu năng

### Latency Targets

| Document Size | Target Latency | Maximum Latency |
|---------------|----------------|-----------------|
| < 10 pages | 100ms | 500ms |
| 10-100 pages | 500ms | 2s |
| 100-500 pages | 2s | 10s |
| 500-1000 pages | 5s | 30s |

**Lý do:** Structure detection là thuật toán-based (regex, text processing), rất nhanh so với LLM-based approaches.

### Resource Limits

**Memory:**
- Maximum per document: 100MB
- Structure tree size: < 10MB (even for 1000-page docs)

**CPU:**
- Maximum CPU per operation: 25% của một core
- Regex processing optimized cho performance

### Scalability

- **Concurrent operations:** 10 documents đồng thời
- **Large documents:** Streaming processing cho documents >50MB

---

## Chiến lược kiểm thử

### Unit Tests

**Coverage Target:** 90%

**Test Cases:**

1. **Heading Detection:**
   - Detect Markdown headers (##, ###)
   - Detect PDF bold + size patterns
   - Detect ALL CAPS headings
   - Detect DOCX heading styles
   - Detect code structure (class, function)
   - Handle edge cases (no headings, invalid patterns)

2. **Tree Construction:**
   - Build valid hierarchical tree
   - Handle nested sections (H1 > H2 > H3)
   - Auto-correct invalid hierarchy (H1 > H3 → H1 > H2)
   - Generate section paths correctly
   - Handle empty headings array

3. **Boundary Detection:**
   - Detect paragraph boundaries (\n\n)
   - Detect sentence boundaries (. + capital)
   - Annotate tree với boundaries
   - Calculate boundary strengths

4. **Tree Flattener:**
   - Flatten hierarchical tree thành flat list
   - Preserve section order
   - Maintain metadata

5. **Fallback Logic:**
   - Create flat structure khi no headings detected
   - Set hasStructure = false correctly

---

### Integration Tests

**Test Cases:**

1. **End-to-End với Real Documents:**
   - PDF với clear headings → hierarchical tree
   - Markdown file → section detection
   - Plain text → flat fallback
   - Code file → code structure detection

2. **Error Scenarios:**
   - Empty parsedDocs → error
   - No headings detected → fallback
   - Invalid hierarchy → auto-correct

3. **LangGraph Integration:**
   - Receive state từ Parse Stage
   - Update state correctly
   - Transition sang Chunk Stage

---

### Performance Tests

**Test Cases:**

1. **Latency Test:**
   - 10-page PDF: < 100ms
   - 100-page PDF: < 500ms
   - 1000-page PDF: < 5s

2. **Memory Test:**
   - Large document (1000 pages): < 100MB memory
   - Structure tree size: < 10MB

3. **Accuracy Test:**
   - 100 sample documents với known structure
   - Heading detection accuracy: >90%
   - Hierarchy correctness: >95%

---

## Tiêu chí thành công

### Tiêu chí chức năng

- [ ] Phát hiện headings với >90% accuracy cho Markdown, PDF, DOCX
- [ ] Xây dựng hierarchical tree correctly cho structured documents
- [ ] Auto-correct invalid hierarchy (H1 > H3 → H1 > H2)
- [ ] Generate section paths correctly (breadcrumb format)
- [ ] Detect paragraph và sentence boundaries
- [ ] Fallback sang flat structure khi no headings detected
- [ ] **Không fail jobs** chỉ vì thiếu structure
- [ ] Output format nhất quán (StructuredDocument)

### Tiêu chí phi chức năng

- [ ] Đáp ứng latency targets cho tất cả document sizes
- [ ] Memory usage < 100MB per document
- [ ] Không có memory leaks trong 1000 operations
- [ ] Đạt 90%+ unit test coverage
- [ ] Pass tất cả integration tests
- [ ] Log tất cả operations với structured format
- [ ] Document tất cả APIs và error codes

### Tiêu chí chất lượng

- [ ] Zero sử dụng `any` hoặc `as` type assertions
- [ ] Tất cả inputs được validated
- [ ] Tất cả errors properly classified và handled
- [ ] Fallback logic robust và well-tested
- [ ] Tất cả algorithms documented với examples
- [ ] Code follows project standards (docs/code-standards.md)

---

## Các giai đoạn triển khai

### Phase 1: Core Detection (Tuần 1)

**Deliverables:**
- [ ] StructureModule structure
- [ ] MarkdownHeadingDetector implementation
- [ ] PDFHeadingDetector với bold + size logic
- [ ] AllCapsHeadingDetector fallback
- [ ] Basic tree construction (TreeConstructor)
- [ ] Unit tests cho detectors

**Dependencies:**
- Parse Stage completed và returning LangChain Documents

---

### Phase 2: Tree Building & Validation (Tuần 2)

**Deliverables:**
- [ ] TreeConstructor với stack algorithm
- [ ] HierarchyValidator với auto-correction
- [ ] SectionPathGenerator
- [ ] Boundary detection (paragraph, sentence)
- [ ] Tree annotation với boundaries
- [ ] Unit tests cho tree logic

**Dependencies:**
- Phase 1 completed

---

### Phase 3: Advanced Detectors & Flattening (Tuần 3)

**Deliverables:**
- [ ] DocxHeadingDetector (Word styles)
- [ ] CodeHeadingDetector (class, function detection)
- [ ] TreeFlattener implementation
- [ ] Fallback logic cho no-structure documents
- [ ] Integration tests với real documents

**Dependencies:**
- Phase 2 completed
- Sample documents prepared (PDF, DOCX, Code)

---

### Phase 4: Integration & Polish (Tuần 4)

**Deliverables:**
- [ ] LangGraph workflow integration
- [ ] Error handling và logging
- [ ] Performance optimization
- [ ] Documentation (API docs, examples)
- [ ] End-to-end testing với Parse và Chunk Stages

**Dependencies:**
- Phase 3 completed
- LangGraph workflow skeleton ready

---

## Phụ thuộc & Rủi ro

### External Dependencies

| Dependency | Purpose | Risk | Mitigation |
|------------|---------|------|------------|
| Parse Stage | Input documents | Parse failures | Robust validation |
| LangChain Documents | Input format | Format changes | Pin version, tests |
| Native TypeScript | Regex processing | Performance | Optimize patterns |

### Technical Risks

| Rủi ro | Xác suất | Tác động | Giảm thiểu |
|--------|----------|---------|------------|
| Heading detection inaccuracy | Cao | Trung bình | Multiple detection methods, fallback |
| PDF formatting variability | Cao | Trung bình | Bold+size heuristics, ALL CAPS fallback |
| Invalid hierarchy auto-correction errors | Thấp | Thấp | Comprehensive tests, validation |
| Performance degradation với large docs | Trung bình | Thấp | Streaming, optimize regex |

### Business Risks

| Rủi ro | Xác suất | Tác động | Giảm thiểu |
|--------|----------|---------|------------|
| No structure detected (flat docs) | Cao | Thấp | Fallback sang flat structure, không fail |
| Users expect perfect structure detection | Trung bình | Trung bình | Clear documentation, confidence levels |
| Edge cases không được handle | Trung bình | Thấp | Comprehensive testing, fallback logic |

---

## Phụ lục

### Phụ lục A: Heading Detection Patterns

**Markdown:**
```regex
^(#{1,6})\s+(.+)$
```

**PDF Bold + Size:**
```typescript
isBold && fontSize > averageSize * 1.2
```

**ALL CAPS:**
```regex
^([A-Z][A-Z\s0-9:.-]{2,})$
```

**DOCX Styles:**
```typescript
style === 'Heading 1' | 'Heading 2' | ...
```

**Python Code:**
```regex
^class\s+([A-Za-z_][A-Za-z0-9_]*)
^def\s+([A-Za-z_][A-Za-z0-9_]*)
```

---

### Phụ lục B: Example Structured Document

**Input (Markdown):**
```markdown
# Chapter 1: Introduction

This is the introduction.

## Background

Historical context here.

### Early History

Details about early history.

## Motivation

Why we did this project.

# Chapter 2: Methods

Our methodology.
```

**Output (StructuredDocument):**
```json
{
  "id": "file-123",
  "title": "report.md",
  "sections": [
    {
      "id": "file-123_section_0",
      "title": "Chapter 1: Introduction",
      "level": 1,
      "content": "This is the introduction.",
      "sectionPath": "report.md > Chapter 1: Introduction",
      "boundaries": [],
      "metadata": {...}
    },
    {
      "id": "file-123_section_1",
      "title": "Background",
      "level": 2,
      "content": "Historical context here.",
      "sectionPath": "report.md > Chapter 1: Introduction > Background",
      "boundaries": [],
      "metadata": {...}
    },
    {
      "id": "file-123_section_2",
      "title": "Early History",
      "level": 3,
      "content": "Details about early history.",
      "sectionPath": "report.md > Chapter 1: Introduction > Background > Early History",
      "boundaries": [],
      "metadata": {...}
    },
    {
      "id": "file-123_section_3",
      "title": "Motivation",
      "level": 2,
      "content": "Why we did this project.",
      "sectionPath": "report.md > Chapter 1: Introduction > Motivation",
      "boundaries": [],
      "metadata": {...}
    },
    {
      "id": "file-123_section_4",
      "title": "Chapter 2: Methods",
      "level": 1,
      "content": "Our methodology.",
      "sectionPath": "report.md > Chapter 2: Methods",
      "boundaries": [],
      "metadata": {...}
    }
  ],
  "metadata": {
    "totalSections": 5,
    "averageWordCount": 8,
    "hasStructure": true
  }
}
```

---

### Phụ lục C: Configuration Reference

```typescript
interface StructureStageConfig {
  // Heading detection
  headingDetection: {
    markdown: {
      enabled: boolean;  // Default: true
      maxLevel: number;  // Default: 6
    };
    pdf: {
      enabled: boolean;  // Default: true
      fontSizeThreshold: number;  // Default: 1.2 (120% of average)
    };
    allCaps: {
      enabled: boolean;  // Default: true
      maxLength: number;  // Default: 200 chars
    };
    docx: {
      enabled: boolean;  // Default: true
    };
    code: {
      enabled: boolean;  // Default: true
      supportedLanguages: string[];  // Default: ['python', 'javascript', 'typescript', 'java']
    };
  };

  // Tree construction
  treeConstruction: {
    autoCorrectHierarchy: boolean;  // Default: true
    maxDepth: number;  // Default: 6
  };

  // Boundary detection
  boundaryDetection: {
    detectParagraphs: boolean;  // Default: true
    detectSentences: boolean;  // Default: true
  };

  // Fallback
  fallback: {
    createFlatStructure: boolean;  // Default: true
    logWarnings: boolean;  // Default: true
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

### Nguyên tắc thiết kế Structure Stage

**Structure Stage chỉ làm một việc: Detect và build document structure**

1. **Trong phạm vi:**
   - ✅ Phát hiện headings từ text patterns
   - ✅ Xây dựng hierarchical tree
   - ✅ Generate section paths cho navigation
   - ✅ Detect boundaries cho chunking optimization
   - ✅ Fallback sang flat structure nếu cần

2. **Ngoài phạm vi (→ Other Stages):**
   - ❌ Chunking documents (→ Chunk Stage)
   - ❌ Trích xuất entities (→ Enrich Stage)
   - ❌ Generate embeddings (→ Embed Stage)
   - ❌ Tóm tắt sections (→ Enrich Stage)

3. **Lý do thuật toán-based (không LLM):**
   - **Performance:** Milliseconds vs seconds (LLM)
   - **Cost:** Zero API costs
   - **Reliability:** Deterministic results
   - **Scalability:** Xử lý large documents easily
   - **LLM không cần thiết:** Heading patterns rất rõ ràng

4. **Fallback philosophy:**
   - **Never fail jobs** chỉ vì thiếu structure
   - Flat structure vẫn có thể index và retrieve
   - Log warnings để improve detection algorithms sau

---

**Trạng thái tài liệu:** Nháp
**Xem xét tiếp theo:** 2025-11-10
**Lịch sử phiên bản:**
- v1.0 (2025-11-03): Tạo Structure Stage implementation plan ban đầu (tiếng Việt)

---

**Kết thúc tài liệu**
