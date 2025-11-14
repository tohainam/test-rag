# LTV Assistant CMS - Comprehensive Analysis

## Executive Summary

The ltv-assistant-cms is a React-based administrative frontend for the LTV Assistant platform. It serves as the central hub for managing users, documents, data sources, API tokens, and evaluation workflows. The CMS uses Mantine UI framework with TypeScript, providing a modern, type-safe admin interface with role-based access control.

---

## 1. ARCHITECTURE & TECHNOLOGY STACK

### Frontend Framework
- **React 19.2.0** with TypeScript
- **Mantine UI 8.3.6** for component library
- **Mantine Data Table** for data visualization
- **React Router 7.9.4** for client-side routing
- **Axios** for HTTP client
- **Vite** for build tooling

### State Management
- **React Context API** (no Redux/Zustand)
  - AuthContext for authentication state
  - Custom hooks (useAuth, useRetrievalQuery, etc.)
- **Local component state** (useState) for UI state
- **No global state management** for data - each component manages its own data fetching

### Key Dependencies
- `@mantine/form`: Form handling and validation
- `@mantine/modals`: Modal dialogs
- `@mantine/notifications`: Toast notifications
- `@mantine/hooks`: Debounced values, media queries
- `jwt-decode`: Token parsing
- `date-fns`: Date manipulation

---

## 2. USER MANAGEMENT

### User Roles & Permissions

```
SUPER_ADMIN
├── Full system access
├── User management (create, role assignment)
├── Document management (CRUD)
├── Evaluation system (full)
├── Token management (personal + admin view of all users)
└── Session management (revoke user sessions)

ADMIN
├── Document management (CRUD)
├── Document access control
├── Personal token management
├── Retrieval/search functionality
└── Cannot manage users or evaluations

USER
├── Retrieval/search functionality
├── Personal token management
└── View-only access to documents (if granted)
```

### User Data Model
- `id`: string
- `email`: string
- `name`: string
- `avatar`: optional string
- `role`: UserRole enum
- `createdAt`: timestamp
- `updatedAt`: timestamp

### Authentication Flow
1. **Google OAuth** - Primary auth mechanism
2. **Session persistence** - JWT tokens stored in localStorage
3. **Auto-init** - Auth context initializes on mount, retries failed requests up to 3 times
4. **Role validation** - ProtectedRoute component enforces role-based access

### User Management Features (SUPER_ADMIN only)
- **List users** with pagination, search, sorting, role filtering
- **Update user roles** - Change ADMIN/USER (SUPER_ADMIN cannot be downgraded)
- **Token management access** - Quick navigation to manage user tokens
- **Session management access** - Quick navigation to manage user sessions

**API Endpoints:**
- GET `/users` - List with filters
- GET `/users/search` - Search users
- PATCH `/users/{userId}/role` - Update role

---

## 3. DATA SOURCE MANAGEMENT (Documents)

### Document Types
```
Document (Data Source)
├── title: string (required)
├── description: string (optional)
├── type: 'public' | 'restricted' (default: 'public')
├── createdBy: string
├── createdAt: timestamp
├── updatedAt: timestamp
└── files: File[]
```

### File Properties
```
File
├── id: string
├── documentId: string
├── filename: string
├── fileType: string
├── fileSize: number
├── mimeType: string
├── uploadedAt: timestamp
├── status: 'pending' | 'uploading' | 'uploaded' | 'failed'
├── indexingStatus: 'pending' | 'processing' | 'completed' | 'failed'
├── indexingError?: string (if failed)
├── outboxStatus: 'pending' | 'publishing' | 'published' | 'failed' | 'poison'
└── chunks: ParentChunk[] | ChildChunk[]
```

### Document Management Features (ADMIN + SUPER_ADMIN)

#### Document CRUD
- **Create**: Title required, description optional, set public/restricted
- **Read**: View document details, metadata, file list, chunk information
- **Update**: Edit title, description, type
- **Delete**: Remove document and all associated files

#### File Management
- **Upload**: Single file or multipart upload for large files
  - Presigned URLs for direct S3 upload
  - Multipart upload with part tracking
- **Monitor**: View indexing status and progress
- **Retry**: Re-trigger indexing for failed files
- **Download**: Get presigned download URL
- **Delete**: Remove file from document

#### Document Access Control (Restricted Documents Only)
- **Add users**: Grant access to restricted documents
- **Remove users**: Revoke access
- **Expiration**: Set optional expiry dates for access

### Indexing Pipeline Monitoring
- **Status tracking**: pending → processing → completed/failed
- **Error handling**: Display error messages for failed indexing
- **Chunk visibility**: View parent and child chunks after indexing
- **Retry capability**: Re-attempt failed indexing operations

**Key Endpoints:**
- GET/POST `/documents` - List/create documents
- GET/PATCH/DELETE `/documents/{id}` - Document operations
- POST `/files/documents/{id}/presigned-url` - Single file upload
- POST `/files/documents/{id}/init-multipart` - Multipart upload init
- POST `/files/{fileId}/complete-multipart` - Complete upload
- GET `/documents/{id}/users` - Access control list
- POST/DELETE `/documents/{id}/users/{userId}` - Manage access

---

## 4. AUTHENTICATION & AUTHORIZATION

### Authentication Mechanism
- **Provider**: Google OAuth (primary)
- **Token storage**: localStorage with key `access_token`
- **Token format**: JWT (parsed with jwt-decode)
- **Automatic renewal**: Logout on 401/403 responses

### Authorization Strategy
1. **Route-level**: ProtectedRoute component wraps authenticated routes
2. **Role-based**: allowedRoles prop restricts access
3. **Backend enforcement**: All access control delegated to backend
4. **Fallback handling**: Network errors retry up to 3 times

### Auth API
```
GET /auth/me - Get current user info
POST /auth/logout - Logout
GET /auth/google-login-url - Get OAuth URL
```

### Access Control Architecture
```
Routes
├── Public (/login, /auth/callback)
├── Authenticated (all others)
│   ├── Dashboard (all authenticated users)
│   ├── Retrieval (all authenticated users)
│   ├── Personal Tokens (all authenticated users)
│   ├── Documents (ADMIN + SUPER_ADMIN)
│   ├── User Management (SUPER_ADMIN)
│   ├── Evaluation (SUPER_ADMIN)
│   ├── User Tokens Admin (SUPER_ADMIN)
│   └── User Sessions Admin (SUPER_ADMIN)
```

---

## 5. UI COMPONENTS & KEY SCREENS

### Page Structure

```
Main Layout
├── Header
│   ├── Burger menu (mobile)
│   ├── App title
│   ├── Theme toggle (dark/light)
│   └── User menu (logout)
├── Sidebar (navigation)
└── Content area
```

### Navigation Items

| Item | Icon | Path | Visible To |
|------|------|------|-----------|
| Dashboard | Home | `/dashboard` | All authenticated |
| Search (Tìm kiếm) | Search | `/retrieval` | All authenticated |
| Documents | Files | `/documents` | ADMIN, SUPER_ADMIN |
| Evaluation | Chart | `/evaluation/...` | SUPER_ADMIN only |
| Users | Users | `/users` | SUPER_ADMIN only |
| API Tokens | Key | `/tokens` | All authenticated |

### Key Screen Descriptions

#### Dashboard (`/dashboard`)
- Quick action cards:
  - Documents (for ADMIN/SUPER_ADMIN)
  - API Tokens (all users)
  - User Management (SUPER_ADMIN only)
- Role-based card visibility

#### Documents Page (`/documents`)
- **Data table** with pagination
- **Search** by title/description
- **Filter** by type (public/restricted)
- **Sorting** by multiple columns
- **Actions**: View, Edit, Delete
- **Creation**: Navigate to create page

#### Document Details (`/documents/{id}`)
- Document metadata display
- **Files section**: Upload, list, manage
- **Access control** (for restricted docs): Add/remove users
- Breadcrumb navigation
- Upload modal for adding files

#### File Details (`/files/{fileId}`)
- File metadata (size, type, dates)
- **Indexing status** with progress
- **Outbox status** (publishing state)
- **Chunk tabs**:
  - Parent chunks table
  - Child chunks table
  - Visualization (coming soon)
- **Retry button** (if failed)
- Error display

#### User Management (`/users`)
- **Data table** with all users
- **Search** by name/email
- **Filter** by role
- **Sort** by multiple columns
- **Inline role editing** (cannot change SUPER_ADMIN)
- **Quick actions**:
  - Manage Personal Access Tokens
  - Manage Sessions

#### Personal Tokens (`/tokens`)
- **List** all personal access tokens
- **Create** new tokens with optional expiry
- **Revoke** tokens with confirmation
- **Display** token once (copy-able)
- **Maximum** 10 active tokens per user

#### User Tokens Admin (`/users/{userId}/tokens`)
- **Similar** to personal tokens but admin can:
  - Create tokens for other users
  - Revoke any user's tokens
- Breadcrumb navigation

#### User Sessions Admin (`/users/{userId}/sessions`)
- **List** all active refresh tokens (sessions)
- **Revoke** specific sessions
- **Show** session expiry dates
- Breadcrumb navigation

#### Retrieval Page (`/retrieval`)
- **Search bar** with query input
- **Advanced options**:
  - Top-K selection
  - Retrieval mode (retrieval_only vs generation)
  - Cache toggle
- **Results display**:
  - Context cards with metadata
  - Metrics: duration, cache hit/miss
  - Retrieval count

#### Evaluation Dashboard (`/evaluation/dashboard`)
- **Auto-load** latest completed run
- **Metrics cards**:
  - Context Precision (with progress)
  - Context Recall (with progress)
  - Context Relevancy (with progress)
  - Overall Score
- **Statistics**:
  - Total questions
  - Processing time
  - Success rate
- **Results table** with pagination
- **Export** to CSV/JSON
- **Question detail modal**

#### Run Evaluation Page (`/evaluation/run`)
- **Dataset selection** dropdown
- **Configuration**:
  - Top-K parameter
  - Dataset info display
- **Progress tracking**:
  - Real-time progress bar
  - Status indicators
  - Question counts (completed/failed)
- **Auto-redirect** on completion

#### Datasets Page (`/evaluation/datasets`)
- **Grid view** of datasets
- **Card display**:
  - Name and date
  - Source badge
  - Description
  - Generation job progress
  - Question/file counts
- **Quick actions**:
  - Manage questions
  - Manage files
  - Run evaluation
  - Edit dataset
  - Delete dataset
- **Create/Edit modals** for dataset management

#### Job History Page (`/evaluation/jobs`)
- **List** all evaluation jobs with status
- **Filter** by status and dataset
- **Display** progress for running jobs
- **Show** completion times and statistics

---

## 6. API INTEGRATION

### API Client Setup
```typescript
// axios.ts - Centralized Axios instance
- Base URL: import.meta.env.VITE_API_URL
- Auth header: Authorization: Bearer {token}
- Interceptors: Auto-handle 401/403 errors
```

### API Domains

#### Documents API (`/documents`)
- CRUD operations for documents
- File management (upload, download, delete)
- User access management
- Indexing status tracking

#### Files API (`/files`)
- Presigned URL generation
- Multipart upload management
- File details with chunks
- Download URLs
- Retry indexing

#### Evaluation API (`/evaluation`)
- Files management (upload, list, delete)
- Datasets CRUD
- Questions management (bulk add, update, delete, reorder)
- Jobs creation and status tracking
- Dashboard metrics
- Results export (CSV/JSON)
- Question generation triggers

#### User Management API (`/users`)
- List users with pagination
- Search users
- Update user roles
- Token management (personal + admin)
- Session management

#### Auth API (`/auth`)
- Get current user
- Logout
- Google OAuth integration

#### Retrieval API (`/query`)
- Execute search queries
- Return retrieved contexts
- Metrics (duration, cache status)

---

## 7. STATE MANAGEMENT

### Local State Pattern
Each feature manages its own state:

```typescript
// Example: Documents Page
const [documents, setDocuments] = useState<Document[]>([])
const [loading, setLoading] = useState(false)
const [page, setPage] = useState(1)
const [search, setSearch] = useState('')
const [roleFilter, setRoleFilter] = useState('')

// Debounced search
const [debouncedSearch] = useDebouncedValue(search, 500)

// Fetch on dependencies change
useEffect(() => {
  fetchData()
}, [page, debouncedSearch, filters])
```

### Context API Usage
- **AuthContext**: Global auth state, login, logout
- No other global contexts for data

### Custom Hooks Pattern
```typescript
// Example hooks
useAuth() - Get current user
useRetrievalQuery() - Execute searches
useDatasets() - Manage datasets
useEvaluation() - Evaluation operations
useFiles() - File management
```

### Data Fetching Pattern
1. **Load on mount**: useEffect with dependency
2. **Pagination**: Track page state
3. **Filtering**: Track filter states
4. **Debouncing**: Apply for search fields
5. **Error handling**: Show notifications
6. **Loading states**: Show spinners/overlays

---

## 8. ANALYTICS & REPORTING

### Current Dashboards

#### Evaluation Dashboard
Displays comprehensive metrics from RAGAS evaluation system:
- **Metrics**:
  - Context Precision (average score)
  - Context Recall (average score)
  - Context Relevancy (average score)
  - Overall Score
- **Statistics**:
  - Total questions evaluated
  - Completed vs failed counts
  - Success rate percentage
  - Processing time (total and per question)
- **Results table** with individual question metrics
- **Export capability** (CSV/JSON formats)

#### Run Overview
- Run metadata (run ID, dataset, completion time)
- Question completion stats
- Processing time analytics
- Success rate calculation

#### Result Details
- Individual question metrics
- Retrieved contexts
- Expected context comparison
- Error messages (if failed)

### Metrics Collected
- Per-question: precision, recall, relevancy, status
- Per-run: total questions, success rate, processing time
- Aggregated: mean, median, std dev, min, max
- Dataset-level: question count, file count, generation progress

### Reporting Capabilities
- **Export formats**: CSV, JSON
- **Export types**: Summary (aggregated), Detailed (all questions)
- **No scheduled reports** - Manual export only
- **No historical comparisons** - Single run view only
- **No trend analysis** - No time-series data

### Data Visibility Gaps
**What's visible:**
- Evaluation metrics (precision, recall, relevancy)
- Question pass/fail counts
- Processing performance
- Individual question results

**What's missing:**
- Document indexing health monitoring
- File processing metrics
- Token usage analytics
- User activity logs
- API call metrics
- Error rates by type
- System performance metrics
- Data source coverage metrics
- Cache performance metrics
- Retrieval quality over time

---

## 9. ADMIN CAPABILITIES

### Super Admin Operations

#### User Administration
- View all users with pagination/search
- Change user roles (ADMIN ↔ USER)
- Manage personal access tokens for any user
- Revoke user sessions
- View token usage and expiry

#### Document Administration
- Create/edit/delete documents
- Upload and manage files
- Monitor indexing pipeline
- Control document access (restricted docs)
- Retry failed indexing operations

#### Evaluation System
- Create and manage datasets
- Upload evaluation files
- Manage questions (add, edit, delete, reorder)
- Run evaluation jobs
- View evaluation results and metrics
- Track job history
- Export results (CSV/JSON)
- Auto-generate questions from documents

#### Token Management
- Create API tokens for users
- View all personal tokens (system-wide)
- Revoke any token
- Set expiry dates

#### Session Management
- View all active user sessions
- Revoke specific sessions
- Monitor session expiry

### Admin Operations (Limited)
- Document CRUD
- File management
- Document access control
- Personal token management
- Retrieval/search

### User Operations
- Create personal tokens
- Revoke own tokens
- Search documents (retrieval)
- View assigned documents

---

## 10. NAVIGATION & ROUTING

### Route Structure
```
/
├── /login - Public login page
├── /auth/callback - OAuth callback
└── /dashboard - Protected routes
    ├── /dashboard - Main dashboard
    ├── /retrieval - Search interface
    ├── /tokens - Personal tokens
    ├── /documents - Document list (ADMIN+)
    │   ├── /documents/new - Create
    │   ├── /documents/:id - View details
    │   └── /documents/:id/edit - Edit
    ├── /files/:fileId - File details
    ├── /users - User management (SUPER_ADMIN)
    ├── /users/:userId/tokens - Admin token management
    ├── /users/:userId/sessions - Admin session management
    └── /evaluation - Evaluation system (SUPER_ADMIN)
        ├── /evaluation/dashboard - Results dashboard
        ├── /evaluation/run - Run evaluation
        ├── /evaluation/files - File management
        ├── /evaluation/datasets - Dataset management
        │   ├── /evaluation/datasets/:id/questions - Manage questions
        │   └── /evaluation/datasets/:id/files - Manage files
        └── /evaluation/jobs - Job history
```

### Navigation Components
- **Sidebar**: Left navigation with role-based items
- **Header**: Top bar with user menu and theme toggle
- **Breadcrumbs**: Show current path on detail pages
- **Mobile**: Burger menu for responsive navigation

---

## 11. STATE MANAGEMENT ARCHITECTURE ANALYSIS

### Current Approach: Decentralized
- **No Redux/Zustand**: Each component manages its own state
- **Auth Context**: Only global state management
- **API calls**: Directly in components via custom hooks
- **Data caching**: No caching layer (fresh fetch on each mount)

### Implications
**Strengths:**
- Lightweight (no extra dependencies)
- Simple to understand and maintain
- Works well for admin-focused app

**Weaknesses:**
- Duplicate API calls if multiple pages need same data
- No offline support
- No optimistic updates
- Page refetch on route changes
- No undo/redo capabilities

---

## 12. ADMIN VISIBILITY GAPS

### Missing Operational Dashboards

1. **System Health Dashboard**
   - Document indexing health (success/failure rates)
   - File processing queue status
   - API health indicators
   - Service uptime monitoring

2. **Usage Analytics**
   - Active user count
   - Token usage frequency
   - API endpoint usage distribution
   - Peak usage times

3. **Data Quality Metrics**
   - Document coverage by type
   - File size distribution
   - Chunk statistics
   - Indexing performance metrics

4. **Retrieval System Metrics**
   - Query performance (latency)
   - Cache hit/miss rates
   - Most searched queries
   - Retrieved context quality

5. **Error Tracking**
   - Indexing failure reasons
   - API error rates
   - Failed queries
   - Token validity issues

6. **Evaluation Trends**
   - Historical evaluation results
   - Metric trends over time
   - Best/worst performing datasets
   - Question difficulty analysis

7. **Security & Compliance**
   - Active sessions per user
   - Token refresh patterns
   - Failed login attempts
   - Access control audit trail

8. **Performance Monitoring**
   - Document upload performance
   - Query latency distribution
   - Evaluation job performance
   - Database performance metrics

---

## 13. USER WORKFLOWS NEEDING METRICS

### Document Management Workflow
**Current visibility:**
- Document count and types
- File upload status
- Indexing status

**Metrics that would help:**
- Average indexing time
- Indexing failure rate and reasons
- Document coverage by category
- Storage usage trends
- Most updated documents

### Retrieval Testing Workflow
**Current visibility:**
- Individual query results
- Cache hit indicator
- Response latency

**Metrics that would help:**
- Query performance trends
- Cache effectiveness
- Search quality metrics
- Failed query patterns
- User search behavior

### Evaluation Workflow
**Current visibility:**
- Evaluation dashboard with metrics
- Job history with status
- Result export

**Metrics that would help:**
- Evaluation history timeline
- Metric improvement/regression
- Dataset quality analysis
- Question difficulty distribution
- Evaluation time trends

### User Management Workflow
**Current visibility:**
- User list with roles
- Token creation/revocation
- Session management

**Metrics that would help:**
- User activity logs
- Token usage patterns
- Session duration analysis
- Role distribution
- New user onboarding tracking

### Token Management Workflow
**Current visibility:**
- Personal token list with expiry
- Admin token view for users
- Creation/revocation

**Metrics that would help:**
- Token usage frequency
- Token lifetime analysis
- Expired token tracking
- API endpoint access patterns
- Token rotation behavior

---

## 14. TECHNICAL IMPLEMENTATION DETAILS

### Component Architecture
- **Smart/Container Components**: Fetch data, manage state
- **Presentational Components**: Pure UI, receive props
- **Feature-based structure**: Each feature in separate folder

### Error Handling
- **Try-catch blocks**: In async operations
- **Silent failures**: Many errors logged but not shown
- **User notifications**: Mantine notifications for important errors
- **Network errors**: Retry logic for auth, silent failure for others

### Form Handling
- **Mantine Forms**: useForm hook for validation
- **Custom validation**: In form field props
- **Submit handling**: Async with loading states

### Data Tables
- **Mantine Data Table**: For list views
- **Features**:
  - Pagination
  - Sorting (click header)
  - Search/filter
  - Responsive design
  - Loading states
  - Empty states

### Modals & Dialogs
- **Mantine Modals**: For confirmations and forms
- **Modal patterns**:
  - Confirmation modals
  - Form submission modals
  - Display modals

### Notifications
- **Mantine Notifications**: Toast messages
- **Types**: Success, error, info
- **Auto-dismiss**: Configurable timeout

### Loading States
- **Spinner**: Center-aligned loader
- **Loading overlay**: Semi-transparent overlay
- **Skeleton**: Not used (full spinner instead)
- **Button loading**: Built-in loading prop

### Error Boundaries
- **None explicitly implemented**
- **Route-level error handling**: Navigation fallback
- **Component-level**: Try-catch with error display

---

## 15. DEPLOYMENT & CONFIGURATION

### Environment Variables
```
VITE_API_URL=http://localhost:50050  // API gateway base URL
```

### Build Process
- Vite build system
- TypeScript compilation
- CSS modules with PostCSS

### Docker Support
- Dockerfile for containerization
- Nginx config for serving SPA
- Port: 3000

### Code Quality
- ESLint configuration
- Prettier formatting
- StyleLint for CSS
- TypeScript strict mode
- No eslint disables allowed

---

## SUMMARY TABLE: CMS CAPABILITIES

| Capability | Available | Users | Features |
|-----------|-----------|-------|----------|
| User Management | ✓ | SUPER_ADMIN | View, filter, search, role change |
| Document Management | ✓ | ADMIN+ | CRUD, access control, metadata |
| File Upload | ✓ | ADMIN+ | Single/multipart, progress tracking |
| File Indexing | ✓ | ADMIN+ | Monitor, retry, view chunks |
| API Tokens | ✓ | All | Create, revoke, view, manage expiry |
| Sessions | ✓ | SUPER_ADMIN | View, revoke user sessions |
| Search/Retrieval | ✓ | All | Query, view results, cache info |
| Evaluation | ✓ | SUPER_ADMIN | Datasets, questions, runs, results |
| Results Export | ✓ | SUPER_ADMIN | CSV/JSON formats |
| Metrics Dashboard | ✓ | SUPER_ADMIN | Evaluation metrics only |
| User Activity | ✗ | - | Not tracked/displayed |
| System Health | ✗ | - | Not visible |
| Error Tracking | ✗ | - | Limited logging |
| Performance Metrics | ✗ | - | Not collected |
| Audit Trail | ✗ | - | Not implemented |

---

## RECOMMENDATIONS FOR DASHBOARD ENHANCEMENTS

### High Priority
1. **System Health Dashboard**
   - Document indexing success rates
   - File processing queue depth
   - API error rates by endpoint
   - Service availability indicators

2. **User Activity Dashboard**
   - Active sessions timeline
   - Token usage patterns
   - Query frequency by user
   - Feature usage distribution

3. **Data Quality Dashboard**
   - Document indexing statistics
   - Chunk count distributions
   - File size analysis
   - Indexing performance trends

### Medium Priority
4. **Retrieval Performance Dashboard**
   - Query latency metrics
   - Cache effectiveness
   - Retrieved context quality
   - Search trends

5. **Evaluation Analytics**
   - Historical metric trends
   - Best/worst datasets
   - Metric improvement tracking
   - Evaluation job performance

6. **Error & Exception Tracking**
   - Error frequency by type
   - Failed operations tracking
   - User-facing error logs
   - Resolution status

### Lower Priority
7. **Audit & Security**
   - Access control changes
   - Failed authentication attempts
   - Token lifecycle tracking
   - Permission changes history

8. **Capacity Planning**
   - Storage usage trends
   - User growth metrics
   - Token allocation analysis
   - Resource utilization

