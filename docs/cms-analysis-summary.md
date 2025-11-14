# LTV Assistant CMS - Executive Summary

## Overview
The ltv-assistant-cms is a React-based administrative interface that serves as the central control panel for the LTV Assistant platform. Built with modern web technologies (React 19, TypeScript, Mantine UI), it provides comprehensive management capabilities for users, documents, API tokens, and evaluation workflows.

## Key Metrics

### Codebase Size
- **Total TypeScript/TSX files**: ~95 files
- **Feature modules**: 9 major features
- **Pages**: 15+ dedicated pages
- **UI Components**: 50+ Mantine-based components

### Architecture Highlights
- **No state management library** (Redux/Zustand) - Pure Context API + local state
- **Decentralized data fetching** - Each component manages its own API calls
- **Type-safe**: Full TypeScript strict mode
- **Mobile-responsive**: Mantine's responsive grid system

## Core Features at a Glance

### User & Access Management
- **3-tier role system**: SUPER_ADMIN, ADMIN, USER
- **User management**: List, search, filter, role assignment
- **API Token management**: Create, revoke, set expiry (10 token limit)
- **Session management**: View and revoke user sessions
- **Google OAuth**: Primary authentication mechanism

### Document Management
- **Document CRUD**: Create, read, update, delete with metadata
- **File handling**: Upload (single & multipart), monitor, retry, download
- **Access control**: Restrict documents to specific users with expiry
- **Indexing pipeline**: Monitor status (pending→processing→completed/failed)
- **Chunk management**: View parent and child chunks after indexing

### Evaluation System
- **Datasets**: Create, manage, and link files
- **Questions**: Add, edit, delete, reorder, auto-generate from files
- **Evaluation runs**: Monitor progress, view real-time metrics
- **Results dashboard**: Precision, recall, relevancy metrics
- **Export**: CSV and JSON format support

### Retrieval & Search
- **Query interface**: Search documents with configurable parameters
- **Advanced options**: Top-K, retrieval mode, cache control
- **Results display**: Context cards with metadata and metrics
- **Cache tracking**: Hit/miss indicators and performance metrics

## Admin Capabilities by Role

### SUPER_ADMIN (Full System Access)
- User management with role assignment
- Complete document lifecycle management
- Evaluation system administration
- Token and session management for all users
- Result export and analytics

### ADMIN (Limited to Documents)
- Create/edit/delete documents
- Upload and manage files
- Control document access
- Personal token management
- Retrieval/search functionality

### USER (Minimal Permissions)
- Personal token management
- Retrieval/search functionality
- View assigned documents only

## Current Visibility & Monitoring

### What's Currently Monitored
✓ User list and roles
✓ Document inventory and status
✓ File indexing progress
✓ Evaluation metrics (precision, recall, relevancy)
✓ Token creation and revocation
✓ Active user sessions
✓ Query results and cache status

### Critical Gaps (Not Monitored)
✗ Document indexing health metrics
✗ File processing performance trends
✗ User activity and usage patterns
✗ API error rates and failure reasons
✗ Token usage frequency and patterns
✗ Query performance and latency
✗ System health and uptime
✗ Audit trails and access logs
✗ Storage usage and capacity
✗ Evaluation result trends over time

## Navigation Structure

```
Dashboard (Home)
├── Documents (ADMIN+)
│   ├── Create/Edit
│   └── File Management & Chunks
├── Retrieval (All Users)
│   └── Search & Results
├── Evaluation (SUPER_ADMIN)
│   ├── Dashboard
│   ├── Run Evaluation
│   ├── Datasets
│   ├── Files
│   └── Job History
├── Users (SUPER_ADMIN)
│   ├── Management
│   ├── Token Admin
│   └── Session Admin
└── Personal Tokens (All Users)
    └── Create/Revoke
```

## Technical Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React | 19.2.0 |
| Language | TypeScript | 5.9.3 |
| UI Library | Mantine | 8.3.6 |
| Router | React Router | 7.9.4 |
| HTTP Client | Axios | 1.13.1 |
| Build Tool | Vite | 7.1.9 |
| State Management | Context API | Native |
| Data Tables | Mantine DataTable | 8.2.0 |
| Forms | Mantine Form | 8.3.6 |
| Icons | Tabler Icons React | 3.35.0 |

## State Management Pattern

### Current Approach (Decentralized)
```
Component Level:
- useState for UI state
- useEffect for data fetching
- Custom hooks for business logic

Global Level:
- AuthContext only
- No Redux/Zustand/Recoil
- No data caching layer

API Integration:
- Axios client with interceptors
- Direct API calls from components
- No query library (React Query, SWR)
```

### Pros & Cons
**Advantages**: Lightweight, simple, easy to follow
**Disadvantages**: Duplicate API calls, no caching, poor offline support, no optimistic updates

## Data Models

### User
```typescript
{
  id: string
  email: string
  name: string
  avatar?: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER'
  createdAt: timestamp
  updatedAt: timestamp
}
```

### Document
```typescript
{
  id: string
  title: string
  description?: string
  type: 'public' | 'restricted'
  createdBy: string
  createdAt: timestamp
  updatedAt: timestamp
  files: File[]
}
```

### File
```typescript
{
  id: string
  documentId: string
  filename: string
  fileSize: number
  fileType: string
  mimeType: string
  status: 'pending' | 'uploading' | 'uploaded' | 'failed'
  indexingStatus: 'pending' | 'processing' | 'completed' | 'failed'
  outboxStatus: 'pending' | 'publishing' | 'published' | 'failed' | 'poison'
  uploadedAt?: timestamp
  indexedAt?: timestamp
  indexingError?: string
}
```

## API Integration

### Base Configuration
- **Base URL**: `import.meta.env.VITE_API_URL` (default: http://localhost:50050)
- **Auth Header**: `Authorization: Bearer {jwt_token}`
- **Error Handling**: Automatic 401/403 logout, retry logic for network errors

### API Endpoints by Feature
- `/users/*` - User management
- `/documents/*` - Document CRUD
- `/files/*` - File operations
- `/evaluation/*` - Evaluation system
- `/query` - Search/retrieval
- `/auth/*` - Authentication

## Key Files & Architecture

### Essential Files
```
src/
├── app/
│   ├── router/index.tsx (routing config)
│   └── providers/ProtectedRoute.tsx (auth enforcement)
├── entities/user/model/
│   └── types.ts (user role definitions)
├── features/
│   ├── auth/ (authentication context)
│   ├── documents/ (document management)
│   ├── files/ (file operations)
│   ├── evaluation/ (evaluation system)
│   ├── retrieval/ (search functionality)
│   ├── user-management/ (user administration)
│   ├── personal-tokens/ (API tokens)
│   └── refresh-tokens/ (sessions)
├── pages/ (route-specific pages)
├── widgets/ (header, sidebar, layout)
└── shared/ (utilities, config, styles)
```

## Recommendations for Enhancement

### High Priority
1. **System Health Dashboard** - Monitor indexing health, API errors, service uptime
2. **User Activity Dashboard** - Track sessions, token usage, feature usage
3. **Data Quality Metrics** - Indexing statistics, chunk distribution, file analysis

### Medium Priority
4. **Retrieval Performance Dashboard** - Query latency, cache effectiveness
5. **Evaluation Analytics** - Historical trends, metric improvement tracking
6. **Error Tracking** - Failure reasons, error frequency, resolution status

### Lower Priority
7. **Audit & Security** - Access logs, failed attempts, token lifecycle
8. **Capacity Planning** - Storage trends, user growth, resource utilization

## Deployment

### Build & Run
```bash
npm install
npm run build      # Production build
npm run dev       # Development server
npm run preview   # Preview production build
```

### Environment Variables
```
VITE_API_URL=http://localhost:50050
```

### Docker
- Dockerfile provided
- Nginx configuration for SPA serving
- Default port: 3000

## Code Quality Standards

### Enforced
- ✓ No use of `any` or `as` (type safety)
- ✓ Full TypeScript strict mode
- ✓ ESLint configuration (no disables)
- ✓ Prettier formatting
- ✓ StyleLint for CSS
- ✓ No commented code or disabled rules

## File Structure
- **Source**: `/Users/tohainam/Desktop/work/ltv-assistant/ltv-assistant-cms/src`
- **Full Analysis**: See `/docs/cms-architecture-analysis.md`
- **Lines of Code**: ~8,000+ lines of TypeScript

## Quick Start for Developers

1. **Access CMS**: `http://localhost:3000`
2. **Login**: Google OAuth
3. **Dashboard**: Main hub with role-based navigation
4. **Documents**: Upload and manage data sources
5. **Evaluation**: Create datasets and run evaluations
6. **Monitoring**: View metrics and results

---

**Document Version**: 1.0
**Last Updated**: November 2024
**Scope**: Complete CMS architecture, capabilities, and gaps analysis

For detailed technical analysis, see `/docs/cms-architecture-analysis.md`
