# LTV Assistant CMS - Comprehensive Redesign Documentation

**Document Version:** 1.0
**Last Updated:** 2025-01-13
**Purpose:** Complete system analysis and redesign specifications for UI/UX designers

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Technical Architecture](#3-technical-architecture)
4. [Feature Inventory](#4-feature-inventory)
5. [User Roles & Permissions](#5-user-roles--permissions)
6. [Page-by-Page Analysis](#6-page-by-page-analysis)
7. [UI/UX Component Inventory](#7-uiux-component-inventory)
8. [User Flows & Wireframes](#8-user-flows--wireframes)
9. [Data Models & API Integration](#9-data-models--api-integration)
10. [Design Patterns & Conventions](#10-design-patterns--conventions)
11. [Pain Points & Opportunities](#11-pain-points--opportunities)
12. [Redesign Recommendations](#12-redesign-recommendations)

---

## 1. Executive Summary

### 1.1 System Purpose

The **LTV Assistant CMS** is a comprehensive Content Management System designed for managing, indexing, and retrieving documents in a Retrieval-Augmented Generation (RAG) system. It serves as the primary interface for administrators and users to interact with the LTV Assistant ecosystem.

**Primary Objectives:**
- Manage document lifecycle (create, upload, index, retrieve)
- Provide intelligent document search and retrieval capabilities
- Enable evaluation and quality assessment of RAG system performance
- Manage user access, roles, and API authentication
- Monitor system health and indexing status

### 1.2 Target Users & Personas

#### Persona 1: Super Administrator
- **Role:** System owner with full control
- **Goals:**
  - Manage all users and permissions
  - Monitor system-wide performance
  - Configure evaluation metrics
  - Access all administrative functions
- **Technical Level:** High
- **Frequency:** Daily

#### Persona 2: Administrator
- **Role:** Content manager
- **Goals:**
  - Manage documents and files
  - Upload and organize content
  - Control document access
  - Monitor indexing status
- **Technical Level:** Medium
- **Frequency:** Daily

#### Persona 3: End User
- **Role:** Document consumer
- **Goals:**
  - Search and retrieve information
  - Access permitted documents
  - Generate API tokens for integrations
- **Technical Level:** Low to Medium
- **Frequency:** Variable (daily to weekly)

### 1.3 System Context

The CMS operates within a larger microservices ecosystem:

```
┌─────────────────────────────────────────────────────────────┐
│                    LTV Assistant Ecosystem                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────────┐ │
│  │ ltv-cms     │───▶│ api-gateway  │───▶│ auth-service   │ │
│  │ (Frontend)  │◀───│              │◀───│                │ │
│  └─────────────┘    └──────────────┘    └────────────────┘ │
│                            │                                 │
│                            ├───▶ datasource-service         │
│                            ├───▶ indexing-service           │
│                            ├───▶ retrieval-service          │
│                            ├───▶ evaluation-service         │
│                            └───▶ mcp-server                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. System Overview

### 2.1 Technology Stack

#### Frontend Core
- **Framework:** React 19.2.0
- **Build Tool:** Vite 7.1.9
- **Language:** TypeScript 5.9.3
- **Styling:** CSS-in-JS (Mantine system)

#### UI Framework & Components
- **Design System:** Mantine UI v8.3.6
- **Component Library Extensions:**
  - `@mantine/core` - Core components
  - `@mantine/hooks` - Utility hooks
  - `@mantine/form` - Form management
  - `@mantine/modals` - Modal dialogs
  - `@mantine/notifications` - Toast notifications
  - `@mantine/dropzone` - File upload
  - `mantine-datatable` v8.2.0 - Data tables

#### Routing & Navigation
- **Router:** React Router DOM v7.9.4
- **Pattern:** Code-split lazy loading
- **Structure:** Nested route with layout wrappers

#### State Management
- **Global State:** React Context API
- **Local State:** React hooks (useState, useEffect)
- **Form State:** @mantine/form
- **Auth State:** Custom AuthContext provider

#### Data Fetching & API
- **HTTP Client:** Axios 1.13.1
- **API Pattern:** Centralized axios instance
- **Authentication:** JWT with automatic refresh
- **Token Storage:** localStorage

#### Utilities & Helpers
- **Date Handling:** date-fns v4.1.0
- **Class Names:** clsx v2.1.1
- **JWT Parsing:** jwt-decode v4.0.0
- **Icons:** @tabler/icons-react v3.35.0

### 2.2 Architecture Pattern: Feature-Sliced Design (FSD)

The codebase follows Feature-Sliced Design methodology with clear separation of concerns:

```
src/
├── app/                    # Application initialization layer
│   ├── index.tsx          # Root component
│   ├── providers/         # Global providers (Auth, Theme, etc.)
│   └── router/            # Route configuration
│
├── pages/                 # Page components (route-level)
│   ├── login/
│   ├── dashboard/
│   ├── documents/
│   ├── retrieval/
│   ├── evaluation/
│   └── user-management/
│
├── features/              # Feature-specific business logic
│   ├── auth/             # Authentication logic
│   ├── documents/        # Document management
│   ├── retrieval/        # Search & retrieval
│   ├── evaluation/       # RAGAS evaluation
│   ├── personal-tokens/  # API token management
│   └── user-management/  # User CRUD operations
│
├── widgets/              # Complex composite components
│   ├── header/
│   ├── sidebar/
│   └── layout/
│
├── entities/             # Business entities
│   └── user/            # User model & types
│
└── shared/              # Shared utilities
    ├── api/             # API client configuration
    ├── config/          # App configuration
    ├── lib/             # Utility functions
    ├── types/           # Shared types
    └── ui/              # Reusable UI components
```

**Benefits of this architecture:**
- Clear dependency rules (layers can only import from lower layers)
- High cohesion within features
- Easy to locate and modify code
- Scalable for team collaboration
- Prevents circular dependencies

### 2.3 Development Workflow

#### Build & Development
```bash
npm run dev          # Start dev server with HMR
npm run build        # Production build (TypeScript + Vite)
npm run preview      # Preview production build
```

#### Code Quality
```bash
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint + Stylelint
npm run prettier     # Code formatting
npm run check        # Full check (format + typecheck + lint + build)
```

#### Testing
```bash
npm run vitest       # Run tests once
npm run vitest:watch # Watch mode
npm run test         # Full test suite with build
```

### 2.4 Environment Configuration

**Environment Variables:**
- `VITE_API_URL` - Backend API Gateway URL (default: http://localhost:50050)

**API Endpoints Base URL:**
- Development: `http://localhost:50050`
- Production: Configured via deployment environment

---

## 3. Technical Architecture

### 3.1 Application Bootstrap & Entry Point

#### Application Entry (main.tsx)
```
┌──────────────────────────────────────┐
│         index.html                   │
│  <div id="root"></div>              │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│         main.tsx                     │
│  ReactDOM.createRoot(root)          │
│    .render(<App />)                 │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│         app/index.tsx                │
│  <Providers>                        │
│    <RouterProvider router={router}/>│
│  </Providers>                       │
└──────────────────────────────────────┘
```

**Rendering Flow:**
1. HTML loads with root div
2. React 19 concurrent renderer initializes
3. Providers wrap the entire application
4. Router takes over navigation

### 3.2 Provider Hierarchy

```
<MantineProvider theme={theme} defaultColorScheme="auto">
  │
  ├─▶ <Notifications />                  # Toast notifications system
  │
  └─▶ <ModalsProvider>                   # Global modal manager
      │
      └─▶ <AuthProvider>                 # Authentication context
          │
          └─▶ <RouterProvider />         # React Router
              │
              └─▶ Page Components
```

**Provider Responsibilities:**

1. **MantineProvider**
   - Theme configuration and injection
   - CSS variables and color schemes
   - Dark/light mode management
   - Responsive breakpoints

2. **Notifications**
   - Toast notification system
   - Success/error/info/warning messages
   - Auto-dismiss configuration
   - Position management

3. **ModalsProvider**
   - Confirmation dialogs
   - Custom modal management
   - Modal stacking
   - Context-based modal API

4. **AuthProvider**
   - User authentication state
   - JWT token management
   - Login/logout handlers
   - User profile data
   - Protected route logic

### 3.3 Authentication Flow

#### Google OAuth Authentication Process

```
┌─────────────┐
│ User clicks │
│"Login with  │
│  Google"    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│ loginWithGoogle()                   │
│ window.location.href =              │
│   API_URL/auth/google               │
└──────┬──────────────────────────────┘
       │
       ▼ (Browser redirects)
┌─────────────────────────────────────┐
│ Google OAuth Consent Screen         │
│ User authorizes application         │
└──────┬──────────────────────────────┘
       │
       ▼ (Google redirects back)
┌─────────────────────────────────────┐
│ /auth/callback?code=xxx             │
│ Backend validates & creates session │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ AuthCallbackPage extracts:          │
│ - accessToken                       │
│ - user data                         │
│ Stores token in localStorage        │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Navigate to /dashboard              │
│ AuthContext updates user state      │
└─────────────────────────────────────┘
```

#### JWT Token Management

**Token Structure:**
- **Access Token:** Short-lived JWT (stored in localStorage)
  - Used for API authentication
  - Auto-refreshed when expired
  - Format: `Bearer <token>`

- **Refresh Token:** Long-lived HTTP-only cookie
  - Used to obtain new access tokens
  - Cannot be accessed by JavaScript (XSS protection)
  - Managed by backend

**Automatic Token Refresh:**

```
API Request
    │
    ▼
┌──────────────────────────────┐
│ Axios Request Interceptor    │
│ Check if token is expired?   │
└──────┬──────────────┬────────┘
       │              │
    Yes│              │No
       │              │
       ▼              ▼
┌─────────────┐   ┌──────────────────┐
│ Is refresh  │   │ Add Authorization│
│ in progress?│   │ header & proceed │
└──┬────┬─────┘   └──────────────────┘
   │    │
Yes│    │No
   │    │
   ▼    ▼
Queue  Refresh
Request Token
   │    │
   │    ├─▶ POST /auth/refresh
   │    │   (with HTTP-only cookie)
   │    │
   │    ▼
   │  ┌──────────────────────┐
   │  │ New access token     │
   │  │ Update localStorage  │
   │  │ Process queue        │
   │  └──────────────────────┘
   │         │
   └─────────┘
         │
         ▼
   Retry Original
     Request
```

**Key Features:**
- Prevents multiple simultaneous refresh calls
- Queues requests during refresh
- Falls back to login on refresh failure
- Maintains request order integrity

### 3.4 Routing Architecture

#### Route Structure

The application uses React Router v7 with lazy-loaded components for optimal performance:

```
/ (Root)
├── / → Redirect to /login
├── /login → LoginPage (public)
├── /auth/callback → AuthCallbackPage (public)
│
└── Protected Routes (require authentication)
    ├── /dashboard → DashboardPage
    │
    ├── /users → UserManagementPage (SUPER_ADMIN only)
    │
    ├── /tokens → PersonalTokensPage
    │
    ├── /users/:userId/tokens → UserTokensAdminPage (SUPER_ADMIN only)
    │
    ├── /users/:userId/sessions → UserSessionsAdminPage (SUPER_ADMIN only)
    │
    ├── /retrieval → RetrievalPage
    │
    ├── /documents → DocumentsPage (ADMIN, SUPER_ADMIN)
    │   ├── /documents/new → CreateDocumentPage
    │   ├── /documents/:id → DocumentDetailsPage
    │   └── /documents/:id/edit → EditDocumentPage
    │
    ├── /files/:fileId → FileDetailsPage (ADMIN, SUPER_ADMIN)
    │
    └── /evaluation (SUPER_ADMIN only)
        ├── /evaluation/dashboard → EvaluationDashboardPage
        ├── /evaluation/run → RunEvaluationPage
        ├── /evaluation/files → FilesManagementPage
        ├── /evaluation/datasets → DatasetsPage
        ├── /evaluation/datasets/:datasetId/questions → DatasetQuestionsPage
        ├── /evaluation/datasets/:datasetId/files → DatasetFilesPage
        └── /evaluation/jobs → JobHistoryPage
```

#### Route Configuration Pattern

**Lazy Loading Implementation:**
```typescript
// Lazy load with named export extraction
const DashboardPage = lazy(() =>
  import('@/pages/dashboard/ui').then((module) => ({
    default: module.DashboardPage,
  }))
);

// Suspense wrapper for loading states
<Suspense fallback={<PageLoader />}>
  <Outlet />
</Suspense>
```

**Protected Route Wrapper:**
```
┌────────────────────────────────────┐
│ ProtectedRoute Component           │
├────────────────────────────────────┤
│ 1. Check if user is authenticated  │
│ 2. Check user role vs allowed roles│
│ 3. Render or redirect              │
└────────────────────────────────────┘
           │
           ├─▶ Not authenticated → Redirect to /login
           ├─▶ No permission → Show 403 / Redirect
           └─▶ Authorized → Render children
```

#### Navigation Guards

**Authentication Guard:**
- Checks if user context has valid user object
- Redirects to `/login` if not authenticated
- Shows loading state during auth initialization

**Role-Based Authorization:**
```
SUPER_ADMIN can access:
  - All pages
  - User management
  - Evaluation system
  - All documents

ADMIN can access:
  - Dashboard
  - Personal tokens
  - Retrieval
  - Documents (all)
  - Files management

USER can access:
  - Dashboard
  - Personal tokens
  - Retrieval
  - Documents (with explicit access only)
```

### 3.5 Layout System

#### Application Shell Structure

```
┌────────────────────────────────────────────────────────────┐
│ AppShell (Mantine)                                         │
├────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────┐ │
│ │ AppShell.Header (Fixed, height: 60px)                 │ │
│ │                                                         │ │
│ │  [☰] LTV Assistant        [🌙]  [Avatar ▼]          │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌──────────────┐ ┌────────────────────────────────────┐  │
│ │ AppShell.    │ │ AppShell.Main                      │  │
│ │ Navbar       │ │                                     │  │
│ │ (width: 250) │ │  <Page Content>                    │  │
│ │              │ │                                     │  │
│ │ • Dashboard  │ │                                     │  │
│ │ • Tìm kiếm  │ │                                     │  │
│ │ • Documents  │ │                                     │  │
│ │ • Evaluation │ │                                     │  │
│ │ • Users      │ │                                     │  │
│ │ • API Tokens │ │                                     │  │
│ │              │ │                                     │  │
│ │              │ │                                     │  │
│ └──────────────┘ └────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Responsive Behavior:**

Desktop (> 768px):
- Sidebar: Collapsible, default open
- Width: 250px when open, hidden when collapsed
- Toggle via burger icon

Mobile (≤ 768px):
- Sidebar: Drawer overlay
- Full screen when open
- Auto-closes on navigation
- Touch-friendly tap targets

#### Header Component Details

**Left Section:**
- Burger menu icon (toggles sidebar)
- Application logo/title: "LTV Assistant"

**Right Section:**
- Theme toggle button (dark/light mode)
- User profile menu with:
  - Avatar (first letter of name)
  - User name
  - Email address
  - Logout option

**Header Implementation Features:**
- Sticky positioning (stays on scroll)
- Z-index layering above content
- Responsive padding and spacing
- Theme-aware colors

#### Sidebar Component Details

**Navigation Items:**
Each nav item includes:
- Icon (from @tabler/icons-react)
- Label text
- Active state styling
- Role-based visibility
- Optional children (nested items)

**Nested Navigation Example:**
```
Evaluation (parent)
  ├── Dashboard
  ├── Run Evaluation
  ├── Datasets
  ├── Files
  └── Job History
```

**Active State Logic:**
- Matches exact path: `/dashboard`
- Matches path prefix: `/documents/*`
- Highlights parent when child is active

**Mobile Optimizations:**
- Auto-close on navigation
- Touch-optimized tap targets (min 44px)
- Swipe-to-close gesture support
- Overlay darkens background

---

## 4. Feature Inventory

### 4.1 Authentication & Authorization

#### Features:
- **Google OAuth Integration**
  - Single Sign-On (SSO)
  - Automatic account creation
  - Profile information sync

- **JWT Token Management**
  - Access token (localStorage)
  - Refresh token (HTTP-only cookie)
  - Automatic token refresh
  - Token expiration handling

- **Session Management**
  - Multi-device support
  - Active session tracking
  - Session revocation
  - Last activity timestamp

- **Protected Routes**
  - Authentication guards
  - Role-based authorization
  - Permission checks
  - Redirect handling

#### User Experience Flow:

1. **Login Screen:**
   - Clean, centered layout
   - "Continue with Google" button
   - Branded with LTV Assistant identity
   - Loading states during OAuth redirect

2. **OAuth Callback:**
   - Processes Google authentication
   - Extracts tokens from URL
   - Stores credentials
   - Redirects to dashboard

3. **Session Persistence:**
   - Remembers user across page reloads
   - Auto-login if valid token exists
   - Graceful logout on token expiration

### 4.2 Dashboard

#### Purpose:
Central hub providing quick access to primary system functions.

#### Features:
- **Welcome Message**
  - Personalized greeting with user name
  - Contextual time-based greeting

- **Quick Action Cards**
  - Visual cards for primary workflows
  - Icon-based identification
  - Role-filtered display
  - Click-to-navigate

**Available Quick Actions:**

| Card | Icon | Description | Allowed Roles |
|------|------|-------------|---------------|
| Documents | 📄 | Manage documents, upload files | ADMIN, SUPER_ADMIN |
| API Tokens | 🔑 | Create and manage PATs | All roles |
| User Management | 👥 | Manage users and permissions | SUPER_ADMIN |

**Card Layout:**
```
┌──────────────────────────────────┐
│ [📄]                            │
│                                  │
│ Documents                        │
│ Manage your documents, upload    │
│ files, and control access        │
│                                  │
│               [Go to Documents →]│
└──────────────────────────────────┘
```

#### UI Characteristics:
- Grid layout (1-3 columns based on screen size)
- Card hover effects (subtle elevation)
- Color-coded cards by category
- Responsive typography
- Empty states for users with no actions

### 4.3 Document Management

#### Overview:
Complete CRUD system for organizing and managing documents within the RAG system.

#### Core Capabilities:

**4.3.1 Document Listing**
- Paginated table view (10 items per page)
- Search by title or description
- Filter by document type (public/restricted)
- Sort by creation date
- Real-time file count display

**Table Columns:**
- Title (30% width)
- Description (30% width, truncated)
- Type badge (10% - green for public, orange for restricted)
- File count (8%)
- Created date (10%)
- Actions (12% - view, edit, delete)

**4.3.2 Document Creation**
Form fields:
- **Title** (required, text input)
- **Description** (optional, textarea, 4 rows min)
- **Type** (required, select dropdown)
  - Public: Accessible to all authenticated users
  - Restricted: Requires explicit user assignment

**Validation:**
- Title cannot be empty
- Type must be selected
- Character limits displayed

**4.3.3 Document Details View**

Layout structure:
```
┌─────────────────────────────────────────────────┐
│ [← Documents] / Document Title                  │
├─────────────────────────────────────────────────┤
│                                                  │
│ Document Title                [Manage Users] [Edit]│
│ [public badge]                                   │
│                                                  │
│ ┌─────────────────────────────────────────────┐│
│ │ Description                                  ││
│ │ Lorem ipsum dolor sit amet...                ││
│ │                                               ││
│ │ ─────────────────────────────────────────── ││
│ │                                               ││
│ │ Created: Jan 15, 2025                        ││
│ │ Updated: Jan 15, 2025                        ││
│ └─────────────────────────────────────────────┘│
│                                                  │
│ ┌─────────────────────────────────────────────┐│
│ │ Files (3)                    [Upload Files] ││
│ │                                               ││
│ │ [File Table]                                 ││
│ └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**Information Displayed:**
- Document metadata
- Creation/update timestamps
- Type and access control
- Associated files list with:
  - Filename
  - File size
  - Upload date
  - Indexing status
  - Download link
  - Delete action

**4.3.4 File Upload System**

The file upload system is sophisticated and handles both small and large file uploads efficiently.

**Upload Strategies:**

1. **Simple Upload** (< 5MB):
   - Single presigned URL request
   - Direct upload to MinIO
   - Confirm completion API call

2. **Multipart Upload** (≥ 5MB):
   - Split file into chunks (5MB each)
   - Request presigned URL for each part
   - Parallel upload with progress tracking
   - Complete multipart API call with ETags

**Upload Flow Diagram:**
```
Select File
    │
    ▼
Check File Size
    │
    ├──▶ < 5MB ──▶ Simple Upload
    │                   │
    │                   ├─▶ Request presigned URL
    │                   ├─▶ Upload to MinIO
    │                   └─▶ Confirm upload
    │
    └──▶ ≥ 5MB ──▶ Multipart Upload
                        │
                        ├─▶ Init multipart
                        ├─▶ Split into chunks
                        ├─▶ Upload parts (parallel)
                        ├─▶ Track progress
                        └─▶ Complete multipart
```

**Upload UI Features:**
- Drag-and-drop zone
- File browser fallback
- Multiple file selection
- Real-time progress bars per file
- Overall upload progress
- File size validation
- File type restrictions
- Cancel upload capability
- Error handling with retry

**Indexing Status:**
After upload, files go through indexing pipeline:

| Status | Badge Color | Description |
|--------|-------------|-------------|
| pending | gray | Waiting in queue |
| processing | blue | Currently indexing |
| indexed | green | Successfully indexed |
| failed | red | Indexing error |

**Failed Indexing Actions:**
- View error details
- Retry indexing button
- Delete corrupted file

**4.3.5 Document User Management** (Restricted Documents)

For restricted documents, administrators can control access:

**User Access Modal:**
```
┌──────────────────────────────────────────┐
│ Document Access Management          [×] │
├──────────────────────────────────────────┤
│                                           │
│ Add User                                  │
│ ┌──────────────────┐  ┌─────────────┐   │
│ │ Select user...   ▼│  │ Add Access │   │
│ └──────────────────┘  └─────────────┘   │
│                                           │
│ Current Access:                           │
│ ┌──────────────────────────────────────┐│
│ │ Name         Email            [×]    ││
│ │ John Doe     john@ex.com      Remove││
│ │ Jane Smith   jane@ex.com      Remove││
│ └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

**Features:**
- Search users by name/email
- Add/remove user access
- Real-time access list
- Prevents duplicate assignments
- Audit log of changes (backend)

### 4.4 Retrieval System (Search Interface)

#### Overview:
The Retrieval System provides intelligent document search powered by the RAG backend. It's the primary interface for end-users to query the knowledge base.

#### UI Layout:

```
┌────────────────────────────────────────────────────────────┐
│ Tìm kiếm Tài liệu                                         │
├────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Câu truy vấn                                           ││
│ │ ┌─────────────────────────────────────────────────────┐││
│ │ │ Nhập câu hỏi của bạn tại đây...                   │││
│ │ │                                                     │││
│ │ │                                                     │││
│ │ └─────────────────────────────────────────────────────┘││
│ │                                                          ││
│ │ Advanced Options ▼                                      ││
│ │ ┌──────────────────────────────────────────────────┐   ││
│ │ │ Top K Results: [10      ]                       │   ││
│ │ │ Mode: [● Retrieval Only  ○ Generation]          │   ││
│ │ │ ☑ Use Cache                                      │   ││
│ │ └──────────────────────────────────────────────────┘   ││
│ │                                                          ││
│ │                                      [Tìm kiếm →]       ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Kết quả         [10 contexts] [450ms] [Cache Hit]      ││
│ ├─────────────────────────────────────────────────────────┤│
│ │                                                          ││
│ │ [Context Card 1 - Score: 0.95]                          ││
│ │ [Context Card 2 - Score: 0.89]                          ││
│ │ [Context Card 3 - Score: 0.85]                          ││
│ │ ...                                                      ││
│ └─────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

#### Search Features:

**4.4.1 Query Input**
- Multi-line textarea (auto-expanding)
- Keyboard shortcut: Ctrl+Enter / Cmd+Enter to search
- Placeholder text in Vietnamese
- Character count indicator
- Clear button

**4.4.2 Advanced Options**

Collapsible section with:

1. **Top K Results** (Number slider)
   - Range: 1-20
   - Default: 10
   - Description: Number of context chunks to retrieve

2. **Mode** (Radio buttons)
   - **Retrieval Only:** Returns raw contexts without AI generation
   - **Generation:** Includes AI-generated answer based on contexts
   - Default: Retrieval Only

3. **Use Cache** (Checkbox)
   - Enable/disable semantic cache
   - Default: Enabled
   - Description: Speeds up repeated similar queries

**4.4.3 Results Display**

**Metadata Badges:**
- **Context count:** Blue badge showing total retrieved contexts
- **Duration:** Gray badge showing query time in milliseconds
- **Cache status:**
  - Green "Cache Hit" if result from cache
  - Gray outline "Cache Miss" if fresh query

**Context Cards:**

Each result card displays:

```
┌──────────────────────────────────────────────────────────┐
│ [Document Icon] Document Title                           │
│                                                    [0.95] │
├──────────────────────────────────────────────────────────┤
│ ...relevant text snippet from the document that matches  │
│ the query. This text is highlighted and shows the        │
│ semantic relevance to the user's question...             │
│                                                           │
│ ─────────────────────────────────────────────────────────│
│                                                           │
│ Source: filename.pdf | Page: 42 | File: Click to view   │
└──────────────────────────────────────────────────────────┘
```

**Card Information:**
- **Header:**
  - Document title (clickable to view full document)
  - Relevance score (0.0 - 1.0, color-coded)
    - 0.9-1.0: Green
    - 0.7-0.89: Blue
    - 0.5-0.69: Orange
    - < 0.5: Gray

- **Content:**
  - Text snippet from the matched chunk
  - Ellipsis for truncated content
  - Expandable to show full context

- **Footer Metadata:**
  - Source filename
  - Page number (if available)
  - Link to full file

**Empty States:**
- No query: "Enter a question to start searching"
- No results: "No relevant documents found. Try rephrasing your query."
- Error: "Failed to retrieve results. Please try again."

#### Search Behavior:

**Loading States:**
- Loading indicator during search
- Disabled input/button while processing
- "Đang tìm kiếm tài liệu..." message

**Error Handling:**
- Network errors: Retry button
- Timeout errors: Suggest reducing Top K
- Permission errors: Alert user

**Performance:**
- Debounced input (if live search enabled)
- Cached results persist during session
- Quick follow-up queries

### 4.5 Evaluation System (RAGAS)

#### Overview:
Comprehensive evaluation system using RAGAS (Retrieval-Augmented Generation Assessment) metrics to measure RAG system performance.

**Purpose:**
- Assess retrieval quality
- Measure generation accuracy
- Track system improvements over time
- Compare different configurations
- Identify weak areas

#### 4.5.1 Evaluation Dashboard

**Primary Page for Viewing Results:**

```
┌────────────────────────────────────────────────────────────┐
│ Evaluation Dashboard                                       │
│ Dataset: Q&A Test Set | Run ID: 3a444e6...                │
│ Completed: Jan 13, 2025 10:30 AM                          │
│                [New Evaluation] [Export CSV] [Export JSON] │
├────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────┐│
│ │Context      │ │Context      │ │Context      │ │Overall││
│ │Precision    │ │Recall       │ │Relevancy    │ │Score  ││
│ │             │ │             │ │             │ │       ││
│ │   0.87      │ │   0.91      │ │   0.85      │ │ 0.88  ││
│ │ [Progress]  │ │ [Progress]  │ │ [Progress]  │ │       ││
│ │ Excellent   │ │ Excellent   │ │ Good        │ │Excellent│
│ └─────────────┘ └─────────────┘ └─────────────┘ └───────┘│
│                                                             │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐│
│ │ Questions    │ │ Processing   │ │ Success Rate         ││
│ │              │ │ Time         │ │                      ││
│ │    150       │ │   3.2m       │ │      96.7%          ││
│ │ 145 / 5 fail │ │ 1.3s per Q   │ │ 145 / 150 questions ││
│ └──────────────┘ └──────────────┘ └──────────────────────┘│
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Results Table                                           ││
│ ├─────────────────────────────────────────────────────────┤│
│ │ Question | Precision | Recall | Relevancy | Status  [▼]││
│ │─────────────────────────────────────────────────────────││
│ │ What is...│  0.95    │  0.92  │  0.88    │ ✓ Success  ││
│ │ How to... │  0.85    │  0.89  │  0.82    │ ✓ Success  ││
│ │ Why does..│  0.42    │  0.55  │  0.48    │ ✗ Failed   ││
│ │ ...       │          │        │          │             ││
│ │                                      Page 1 of 15  [◀ ▶]││
│ └─────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

**Metrics Cards:**

Each metric card displays:
- **Title:** Metric name
- **Value:** Score (0.0 - 1.0, formatted as percentage)
- **Progress Bar:** Visual representation color-coded by performance
- **Badge:** Qualitative assessment
  - 0.8-1.0: "Excellent" (green)
  - 0.6-0.79: "Good" (yellow)
  - < 0.6: "Needs Improvement" (red)

**RAGAS Metrics Explained:**

1. **Context Precision:**
   - Measures if all ground-truth contexts are ranked high
   - Higher is better
   - Indicates retrieval system's ability to prioritize relevant chunks

2. **Context Recall:**
   - Measures if all required contexts are retrieved
   - Higher is better
   - Indicates coverage of relevant information

3. **Context Relevancy:**
   - Measures relevance of retrieved contexts to the question
   - Higher is better
   - Penalizes irrelevant context retrieval

4. **Overall Score:**
   - Aggregate of all metrics
   - Weighted average
   - Primary KPI for system health

**Statistics Cards:**

1. **Questions:**
   - Total questions in dataset
   - Completed count
   - Failed count
   - Failure reasons on hover

2. **Processing Time:**
   - Total evaluation duration
   - Average time per question
   - Helps identify performance bottlenecks

3. **Success Rate:**
   - Percentage of successfully evaluated questions
   - Visual color coding
   - Click to view failed questions

**Results Table:**

Features:
- Sortable columns
- Filter by status (all/success/failed)
- Search by question text
- Pagination (20 items per page)
- Click row to view detailed analysis

**Question Detail Modal:**

When clicking a row:

```
┌───────────────────────────────────────────────────────────┐
│ Question Details                                     [×] │
├───────────────────────────────────────────────────────────┤
│                                                            │
│ Question:                                                  │
│ "What are the benefits of using RAG systems?"             │
│                                                            │
│ Ground Truth:                                              │
│ "RAG systems combine retrieval with generation..."        │
│                                                            │
│ ──────────────────────────────────────────────────────────│
│                                                            │
│ Metrics:                                                   │
│ • Context Precision: 0.95  [████████████░░]               │
│ • Context Recall: 0.88     [███████████░░░]               │
│ • Context Relevancy: 0.92  [████████████░░]               │
│                                                            │
│ ──────────────────────────────────────────────────────────│
│                                                            │
│ Retrieved Contexts: (5)                                    │
│ 1. [Rank 1] "RAG systems..." (relevant: ✓, score: 0.95) │
│ 2. [Rank 2] "Benefits include..." (relevant: ✓, 0.89)   │
│ 3. [Rank 3] "The architecture..." (relevant: ✗, 0.45)   │
│ ...                                                        │
│                                                            │
│ ──────────────────────────────────────────────────────────│
│                                                            │
│ Error Details: (if failed)                                 │
│ "Timeout during context retrieval"                        │
└───────────────────────────────────────────────────────────┘
```

#### 4.5.2 Run Evaluation Page

Interface for starting new evaluation runs:

**Form Fields:**

1. **Dataset Selection** (Required)
   - Dropdown of available datasets
   - Shows question count per dataset
   - Preview button

2. **Configuration Options:**
   - Top K: Number of contexts to retrieve (default: 10)
   - Use Cache: Enable semantic caching (default: off for evaluation)
   - Timeout: Per-question timeout in seconds (default: 30)

3. **Advanced Settings:**
   - Parallel processing: Number of concurrent questions (default: 1)
   - Retry failed: Automatically retry failed questions (default: yes)

**Start Button:**
- Validates all required fields
- Creates evaluation job
- Redirects to job history or dashboard
- Shows progress if staying on page

#### 4.5.3 Datasets Management

**Dataset List Page:**

```
┌────────────────────────────────────────────────────────────┐
│ Datasets                              [Create Dataset]     │
├────────────────────────────────────────────────────────────┤
│                                                             │
│ [Search datasets...]                                        │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Name         Questions  Files  Created      Actions    ││
│ │─────────────────────────────────────────────────────────││
│ │ Q&A Set      150        45     Jan 10, 2025  [Edit][×]││
│ │ Tech Docs    89         23     Jan 08, 2025  [Edit][×]││
│ │ Product FAQ  67         12     Jan 05, 2025  [Edit][×]││
│ └─────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

**Dataset Details:**

Clicking a dataset shows:
- Name and description
- Associated files (ground truth documents)
- Question list with ground truth answers
- Edit/delete questions
- Add new questions
- Manage file associations
- Generate questions (AI-powered)

**Question Generation:**

Special feature to auto-generate evaluation questions from documents:

```
┌───────────────────────────────────────────────────────────┐
│ Generate Questions                                   [×] │
├───────────────────────────────────────────────────────────┤
│                                                            │
│ Select Files:                                              │
│ ☑ document1.pdf                                           │
│ ☑ document2.pdf                                           │
│ ☐ document3.pdf                                           │
│                                                            │
│ Number of Questions: [10          ]                       │
│                                                            │
│ Question Types:                                            │
│ ☑ Factual                                                 │
│ ☑ Analytical                                              │
│ ☐ Opinion-based                                           │
│                                                            │
│                            [Cancel] [Generate Questions]  │
└───────────────────────────────────────────────────────────┘
```

#### 4.5.4 Job History

Track all evaluation runs:

**Job List:**
- Job ID
- Dataset name
- Status (pending/running/completed/failed)
- Started at
- Duration
- Overall score (for completed jobs)
- Actions: View results, re-run, delete

**Job Status Badges:**
- Pending: Gray
- Running: Blue with spinner
- Completed: Green
- Failed: Red

**Live Updates:**
- Auto-refresh for running jobs
- Real-time progress (X / Y questions complete)
- Estimated time remaining

### 4.6 User Management

#### Overview:
Administrative interface for managing user accounts, roles, and permissions.

**Access:** SUPER_ADMIN only

#### 4.6.1 User List Page

```
┌────────────────────────────────────────────────────────────┐
│ User Management                                            │
│ Manage users, roles, and permissions                       │
├────────────────────────────────────────────────────────────┤
│                                                             │
│ [Search by name or email...]    [All Roles ▼]             │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Name       Email           Role        Created   Actions││
│ │─────────────────────────────────────────────────────────││
│ │ Admin User admin@co.com    SUPER_ADMIN  Jan 1   [Lock] ││
│ │ John Doe   john@co.com     [ADMIN ▼]   Jan 5   [T][S] ││
│ │ Jane Smith jane@co.com     [USER ▼]    Jan 8   [T][S] ││
│ │ Bob Wilson bob@co.com      [USER ▼]    Jan 10  [T][S] ││
│ │                                      Page 1 of 8  [◀ ▶]││
│ └─────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘

Legend: [T] = Tokens, [S] = Sessions
```

**Features:**

1. **Search & Filter:**
   - Text search by name or email (debounced)
   - Filter by role (dropdown)
   - Reset filters button
   - Results update in real-time

2. **Role Management:**
   - Inline role editing (dropdown)
   - SUPER_ADMIN roles locked (cannot be changed)
   - ADMIN and USER roles changeable
   - Confirmation on role change
   - Immediate API update

3. **User Actions:**
   - **Tokens Button [T]:** Navigate to user's personal tokens
   - **Sessions Button [S]:** Navigate to user's active sessions
   - Actions disabled for SUPER_ADMIN users

4. **Sorting:**
   - Click column headers to sort
   - Ascending/descending toggle
   - Sort by: name, email, role, creation date

5. **Pagination:**
   - 10 users per page
   - Page navigation arrows
   - Jump to page input

#### 4.6.2 User Tokens Admin

View and manage personal access tokens for any user:

**Features:**
- List all tokens for selected user
- View token metadata (name, prefix, expiration, last used)
- Revoke tokens on behalf of user
- Cannot create tokens for other users
- Audit trail of admin actions

#### 4.6.3 User Sessions Admin

View and manage active sessions for any user:

**Session Information:**
- Device information (browser, OS)
- IP address
- Login timestamp
- Last activity timestamp
- Current session indicator

**Actions:**
- Revoke individual sessions
- Force logout specific device
- View session activity log

**Security Features:**
- Cannot revoke own session without confirmation
- Revoked sessions log out immediately
- User notified of admin actions (via backend)

### 4.7 Personal Access Tokens (PAT)

#### Overview:
API authentication mechanism allowing users to generate tokens for programmatic access to the LTV Assistant system.

#### 4.7.1 Personal Tokens Page

```
┌────────────────────────────────────────────────────────────┐
│ API Tokens                                                 │
│ Create and manage your personal API access tokens         │
│                                      [Create New Token]    │
├────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Name         Token     Last Used      Expires    Actions││
│ │─────────────────────────────────────────────────────────││
│ │ CI/CD       ltv_abc..  Jan 13, 10:30  Never      [×]   ││
│ │ [Expired]                                                ││
│ │ Dev Token   ltv_xyz..  Jan 10, 15:20  Jan 15     [×]   ││
│ │ Prod API    ltv_123..  Never          Jan 20     [×]   ││
│ └─────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

**Token Features:**

1. **Token Naming:**
   - Descriptive names to identify usage
   - Required field during creation
   - Helps track which integrations use which tokens

2. **Token Prefix:**
   - First 8-10 characters shown: `ltv_abc123...`
   - Full token only shown once at creation
   - Cannot retrieve full token later (security)

3. **Expiration:**
   - Optional expiration date
   - "Never" for non-expiring tokens
   - Expired tokens shown with red badge
   - Cannot be used but remain visible

4. **Usage Tracking:**
   - Last used timestamp
   - "Never" if not yet used
   - Helps identify unused/stale tokens

5. **Revocation:**
   - Immediate token invalidation
   - Confirmation modal before deletion
   - Cannot be undone
   - Active API calls fail after revocation

#### 4.7.2 Create Token Modal

```
┌───────────────────────────────────────────────────────────┐
│ Create Personal Access Token                        [×]  │
├───────────────────────────────────────────────────────────┤
│                                                            │
│ Token Name *                                               │
│ ┌────────────────────────────────────────────────────────┐│
│ │ e.g., "CI/CD Pipeline", "Mobile App"                  ││
│ └────────────────────────────────────────────────────────┘│
│                                                            │
│ Expiration (Optional)                                      │
│ ┌────────────────────────────────────────────────────────┐│
│ │ [No expiration ▼]                                      ││
│ │   • No expiration                                      ││
│ │   • 30 days                                            ││
│ │   • 60 days                                            ││
│ │   • 90 days                                            ││
│ │   • Custom date...                                     ││
│ └────────────────────────────────────────────────────────┘│
│                                                            │
│                                   [Cancel] [Create Token] │
└───────────────────────────────────────────────────────────┘
```

#### 4.7.3 Token Created Modal

After successful creation, display token ONCE:

```
┌───────────────────────────────────────────────────────────┐
│ Token Created Successfully                           [×]  │
├───────────────────────────────────────────────────────────┤
│                                                            │
│ ⚠️  Copy this token now. You won't be able to see it     │
│    again!                                                  │
│                                                            │
│ Your new token:                                            │
│ ┌────────────────────────────────────────────────────────┐│
│ │ ltv_abc123def456ghi789jkl012mno345pqr678stu901       ││
│ │                                         [Copy] [✓]     ││
│ └────────────────────────────────────────────────────────┘│
│                                                            │
│ Usage instructions:                                        │
│ Include in API requests:                                   │
│   Authorization: Bearer <your-token>                      │
│                                                            │
│                                           [I've Copied It] │
└───────────────────────────────────────────────────────────┘
```

**Security Best Practices:**
- One-time display of full token
- Copy button with visual feedback
- Warning message about permanence
- Modal cannot be dismissed until acknowledged
- Token stored securely on backend (hashed)

#### 4.7.4 Revoke Token Modal

Confirmation before deletion:

```
┌───────────────────────────────────────────────────────────┐
│ Revoke Token                                         [×]  │
├───────────────────────────────────────────────────────────┤
│                                                            │
│ Are you sure you want to revoke this token?               │
│                                                            │
│ Token: CI/CD                                               │
│ Prefix: ltv_abc...                                        │
│                                                            │
│ ⚠️  This action cannot be undone. All integrations using  │
│    this token will immediately lose access.               │
│                                                            │
│                                   [Cancel] [Revoke Token] │
└───────────────────────────────────────────────────────────┘
```

---

## 5. User Roles & Permissions

### 5.1 Role Hierarchy

```
SUPER_ADMIN (Highest Authority)
    │
    ├─▶ Full system access
    ├─▶ Manage all users
    ├─▶ View all evaluation data
    ├─▶ Access all documents
    └─▶ System configuration

ADMIN (Content Manager)
    │
    ├─▶ Create/edit/delete documents
    ├─▶ Upload and manage files
    ├─▶ Assign document access
    ├─▶ View public & assigned documents
    └─▶ Manage personal tokens

USER (Basic Access)
    │
    ├─▶ Search and retrieve information
    ├─▶ View accessible documents only
    ├─▶ Manage personal tokens
    └─▶ View own profile
```

### 5.2 Detailed Permission Matrix

| Feature | SUPER_ADMIN | ADMIN | USER |
|---------|-------------|-------|------|
| **Authentication** |
| Login with Google | ✓ | ✓ | ✓ |
| Logout | ✓ | ✓ | ✓ |
| View own profile | ✓ | ✓ | ✓ |
| **Dashboard** |
| Access dashboard | ✓ | ✓ | ✓ |
| View quick actions | Role-filtered | Role-filtered | Role-filtered |
| **Documents** |
| List public documents | ✓ | ✓ | ✓ |
| List restricted documents | All | Created + Assigned | Assigned only |
| Create documents | ✓ | ✓ | ✗ |
| Edit any document | ✓ | Own only | ✗ |
| Delete any document | ✓ | Own only | ✗ |
| View document details | ✓ | ✓ | If accessible |
| **Files** |
| Upload files | ✓ | ✓ | ✗ |
| Download files | ✓ | ✓ | If doc accessible |
| Delete files | ✓ | Own doc only | ✗ |
| Retry indexing | ✓ | ✓ | ✗ |
| **Document Access Control** |
| View document users | ✓ | Own doc only | ✗ |
| Add users to document | ✓ | Own doc only | ✗ |
| Remove users from document | ✓ | Own doc only | ✗ |
| **Retrieval/Search** |
| Perform searches | ✓ | ✓ | ✓ |
| View search results | ✓ | ✓ | Filtered |
| Use cache | ✓ | ✓ | ✓ |
| Adjust Top K | ✓ | ✓ | ✓ |
| **Evaluation** |
| View dashboard | ✓ | ✗ | ✗ |
| Run evaluations | ✓ | ✗ | ✗ |
| Create datasets | ✓ | ✗ | ✗ |
| Manage datasets | ✓ | ✗ | ✗ |
| View job history | ✓ | ✗ | ✗ |
| Export results | ✓ | ✗ | ✗ |
| Generate questions | ✓ | ✗ | ✗ |
| **User Management** |
| List all users | ✓ | ✗ | ✗ |
| Change user roles | ✓ | ✗ | ✗ |
| View user tokens (others) | ✓ | ✗ | ✗ |
| Revoke user tokens (others) | ✓ | ✗ | ✗ |
| View user sessions (others) | ✓ | ✗ | ✗ |
| Revoke user sessions (others) | ✓ | ✗ | ✗ |
| **Personal Access Tokens** |
| Create own tokens | ✓ | ✓ | ✓ |
| View own tokens | ✓ | ✓ | ✓ |
| Revoke own tokens | ✓ | ✓ | ✓ |
| **Sessions** |
| View own sessions | ✓ | ✓ | ✓ |
| Revoke own sessions | ✓ | ✓ | ✓ |

### 5.3 Access Control Implementation

#### Frontend Guards:

1. **Route-Level Protection:**
```typescript
<ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
  <EvaluationDashboardPage />
</ProtectedRoute>
```

2. **Component-Level Visibility:**
```typescript
{user?.role === UserRole.SUPER_ADMIN && (
  <Button>Admin Action</Button>
)}
```

3. **Sidebar Navigation Filtering:**
```typescript
const visibleItems = navItems.filter((item) =>
  user ? item.roles.includes(user.role) : false
);
```

#### Backend Verification:

All API endpoints verify:
- Valid JWT token
- User role matches required role
- Resource-level permissions (e.g., can user access this specific document?)

#### Document Access Logic:

```
User wants to access Document X:
  │
  ├─▶ Is user SUPER_ADMIN?
  │   └─▶ Yes: ALLOW
  │
  ├─▶ Is document PUBLIC?
  │   └─▶ Yes: ALLOW
  │
  ├─▶ Is document RESTRICTED?
  │   │
  │   ├─▶ Is user document owner (creator)?
  │   │   └─▶ Yes: ALLOW
  │   │
  │   └─▶ Is user in document's access list?
  │       └─▶ Yes: ALLOW
  │
  └─▶ Otherwise: DENY
```

### 5.4 Role Assignment & Changes

**Initial Role Assignment:**
- First user: Manually set as SUPER_ADMIN in database
- Subsequent users: Assigned USER role by default
- Can be changed by SUPER_ADMIN via User Management

**Role Change Restrictions:**
- SUPER_ADMIN roles cannot be changed via UI
- Requires direct database access for SUPER_ADMIN changes
- Prevents accidental lockout
- Audit logged on backend

**Permission Propagation:**
- Role changes take effect immediately
- Forces token refresh on next API call
- Active sessions remain valid until next request
- UI updates on next page load

---

## 6. Page-by-Page Analysis

### 6.1 Login Page

**Route:** `/login`
**Access:** Public (unauthenticated only)
**Component:** `LoginPage`

**Purpose:**
Entry point for user authentication via Google OAuth.

**Layout:**
```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│         ┌──────────────────────┐       │
│         │  [Google Icon]        │       │
│         │                       │       │
│         │  Welcome back         │       │
│         │  Sign in to your      │       │
│         │  account              │       │
│         │                       │       │
│         │  [Continue with       │       │
│         │   Google →]           │       │
│         │                       │       │
│         └──────────────────────┘       │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

**UI Elements:**
- Centered card (max-width: 380px)
- Elevated paper with border and shadow
- Title: "Welcome back"
- Subtitle: "Sign in to your account"
- Single button: "Continue with Google"
- Google icon on button left
- Responsive padding
- Theme-aware styling

**User Flow:**
1. User lands on login page
2. Clicks "Continue with Google"
3. Redirected to Google OAuth consent
4. Google authenticates and redirects back
5. Lands on `/auth/callback` to process tokens
6. Redirected to `/dashboard`

**Edge Cases:**
- Already authenticated: Auto-redirect to dashboard
- OAuth error: Display error message with retry
- Network failure: Show retry button
- Invalid callback: Redirect back to login

### 6.2 Auth Callback Page

**Route:** `/auth/callback`
**Access:** Public (OAuth flow only)
**Component:** `AuthCallbackPage`

**Purpose:**
Processes OAuth callback, extracts tokens, and completes authentication.

**UI:**
- Loading spinner
- "Processing authentication..." message
- No user interaction required
- Auto-redirects after success

**Process:**
1. Extract tokens from URL query params
2. Store access token in localStorage
3. Update AuthContext with user data
4. Navigate to `/dashboard`

**Error Handling:**
- Missing tokens: Redirect to login
- Invalid tokens: Show error and redirect to login
- API errors: Display message with retry

### 6.3 Dashboard Page

**Route:** `/dashboard`
**Access:** Protected (all authenticated users)
**Component:** `DashboardPage`

**Already documented in section 4.2**

Key characteristics:
- Personalized welcome
- Role-filtered quick action cards
- Responsive grid layout
- Direct navigation to key features

### 6.4 Documents Pages

#### 6.4.1 Documents List

**Route:** `/documents`
**Access:** Protected (ADMIN, SUPER_ADMIN)
**Component:** `DocumentsPage`

**Already documented in section 4.3.1**

Features:
- Paginated table
- Search and filter
- CRUD actions per row
- Empty state for new users
- Real-time file count

#### 6.4.2 Create Document

**Route:** `/documents/new`
**Access:** Protected (ADMIN, SUPER_ADMIN)
**Component:** `CreateDocumentPage`

**Already documented in section 4.3.2**

Form flow:
1. Enter title (required)
2. Enter description (optional)
3. Select type (public/restricted)
4. Submit creates document
5. Redirect to document details page

#### 6.4.3 Document Details

**Route:** `/documents/:id`
**Access:** Protected (ADMIN, SUPER_ADMIN with permission)
**Component:** `DocumentDetailsPage`

**Already documented in section 4.3.3**

Sections:
- Document metadata
- File list with indexing status
- Upload interface
- User management (restricted docs)

#### 6.4.4 Edit Document

**Route:** `/documents/:id/edit`
**Access:** Protected (ADMIN, SUPER_ADMIN with permission)
**Component:** `EditDocumentPage`

**Purpose:**
Modify existing document metadata.

**Form Fields:**
- Title (pre-filled, editable)
- Description (pre-filled, editable)
- Type (pre-filled, editable)

**Behavior:**
- Loads current document data
- Validates changes
- Updates on submit
- Redirects to document details
- Shows error if update fails

**Restrictions:**
- Cannot change type if files exist (prevents access issues)
- Confirmation required for type change
- Cannot delete if files exist

### 6.5 File Details Page

**Route:** `/files/:fileId`
**Access:** Protected (ADMIN, SUPER_ADMIN)
**Component:** `FileDetailsPage`

**Purpose:**
Detailed view of an individual file and its chunks.

**Layout:**
```
┌────────────────────────────────────────────────────────────┐
│ [← Back] filename.pdf                                      │
├────────────────────────────────────────────────────────────┤
│                                                             │
│ File Information          [Download] [Delete] [Retry Index]│
│ ┌─────────────────────────────────────────────────────────┐│
│ │ • Size: 2.4 MB                                          ││
│ │ • Uploaded: Jan 13, 2025 10:30 AM                       ││
│ │ • Status: [Indexed]                                     ││
│ │ • Document: Technical Documentation                      ││
│ │ • MD5: abc123def456...                                  ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ [Parent Chunks Tab] [Child Chunks Tab]                     │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Chunk ID | Text Preview          | Index | Status      ││
│ │──────────────────────────────────────────────────────────││
│ │ chunk-1  | This document...      | 0     | Indexed     ││
│ │ chunk-2  | The architecture...   | 1     | Indexed     ││
│ │ ...                                                      ││
│ └─────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

**Features:**
- File metadata display
- Download original file
- Delete file (with confirmation)
- Retry indexing if failed
- View hierarchical chunks (parent/child)
- Chunk text preview
- Indexing status per chunk

**Chunk Hierarchy:**
- **Parent Chunks:** Large sections of document
- **Child Chunks:** Smaller subsections for better retrieval granularity
- Two tabs to view each level

### 6.6 Retrieval Page

**Route:** `/retrieval`
**Access:** Protected (all authenticated users)
**Component:** `RetrievalPage`

**Already documented in section 4.4**

Primary user-facing search interface with:
- Query input
- Advanced options
- Results with context cards
- Performance metrics

### 6.7 Evaluation Pages

All evaluation pages require SUPER_ADMIN role.

#### 6.7.1 Evaluation Dashboard

**Route:** `/evaluation/dashboard`
**Access:** Protected (SUPER_ADMIN only)
**Component:** `EvaluationDashboardPage`

**Already documented in section 4.5.1**

Displays latest evaluation run with comprehensive metrics and results.

#### 6.7.2 Run Evaluation

**Route:** `/evaluation/run`
**Access:** Protected (SUPER_ADMIN only)
**Component:** `RunEvaluationPage`

**Already documented in section 4.5.2**

Form to start new evaluation jobs.

#### 6.7.3 Datasets

**Route:** `/evaluation/datasets`
**Access:** Protected (SUPER_ADMIN only)
**Component:** `DatasetsPage`

**Already documented in section 4.5.3**

Manage evaluation datasets and questions.

#### 6.7.4 Dataset Questions

**Route:** `/evaluation/datasets/:datasetId/questions`
**Access:** Protected (SUPER_ADMIN only)
**Component:** `DatasetQuestionsPage`

**Purpose:**
Manage questions within a specific dataset.

**Features:**
- List all questions in dataset
- Add new questions manually
- Edit existing questions
- Delete questions
- Import questions from CSV
- Generate questions with AI

**Question Form:**
- Question text (required)
- Ground truth answer (optional)
- Reference documents (optional)
- Tags for categorization

#### 6.7.5 Dataset Files

**Route:** `/evaluation/datasets/:datasetId/files`
**Access:** Protected (SUPER_ADMIN only)
**Component:** `DatasetFilesPage`

**Purpose:**
Associate ground truth files with dataset.

**Features:**
- List associated files
- Add files from document pool
- Remove file associations
- View file details
- Determines which documents are used for ground truth comparison

#### 6.7.6 Files Management

**Route:** `/evaluation/files`
**Access:** Protected (SUPER_ADMIN only)
**Component:** `FilesManagementPage`

**Purpose:**
Manage files specifically for evaluation purposes.

**Features:**
- Upload ground truth documents
- Tag files for evaluation use
- Associate files with datasets
- View file metadata
- Delete evaluation files

#### 6.7.7 Job History

**Route:** `/evaluation/jobs`
**Access:** Protected (SUPER_ADMIN only)
**Component:** `JobHistoryPage`

**Already documented in section 4.5.4**

Track all evaluation runs with status and results.

### 6.8 User Management Pages

All user management pages require SUPER_ADMIN role.

#### 6.8.1 User Management

**Route:** `/users`
**Access:** Protected (SUPER_ADMIN only)
**Component:** `UserManagementPage`

**Already documented in section 4.6.1**

Main interface for managing all users.

#### 6.8.2 User Tokens Admin

**Route:** `/users/:userId/tokens`
**Access:** Protected (SUPER_ADMIN only)
**Component:** `UserTokensAdminPage`

**Already documented in section 4.6.2**

View and revoke tokens for specific user.

#### 6.8.3 User Sessions Admin

**Route:** `/users/:userId/sessions`
**Access:** Protected (SUPER_ADMIN only)
**Component:** `UserSessionsAdminPage`

**Already documented in section 4.6.3**

View and manage sessions for specific user.

### 6.9 Personal Tokens Page

**Route:** `/tokens`
**Access:** Protected (all authenticated users)
**Component:** `PersonalTokensPage`

**Already documented in section 4.7**

Self-service PAT management for API integration.

---

## 7. UI/UX Component Inventory

### 7.1 Mantine UI Components Used

The application leverages Mantine's comprehensive component library:

**Layout Components:**
- `AppShell` - Main application shell with header/navbar/main
- `Container` - Content width constraints
- `Stack` - Vertical layout utility
- `Group` - Horizontal layout utility
- `Grid` / `SimpleGrid` - Grid layouts
- `Paper` - Elevated content containers

**Navigation:**
- `NavLink` - Sidebar navigation items
- `Burger` - Mobile menu toggle
- `Breadcrumbs` - Page navigation trail (via custom PageBreadcrumbs)

**Data Display:**
- `DataTable` (mantine-datatable) - Feature-rich tables
- `Badge` - Status indicators
- `Card` - Content cards
- `Text` - Typography with variants
- `Title` - Heading levels
- `ThemeIcon` - Icon containers

**Inputs:**
- `TextInput` - Single-line text
- `Textarea` - Multi-line text
- `Select` - Dropdown selections
- `Checkbox` - Boolean inputs
- `Button` - Actions
- `ActionIcon` - Icon buttons
- `Dropzone` (@mantine/dropzone) - File uploads

**Feedback:**
- `Loader` - Loading indicators
- `Progress` - Progress bars
- `Alert` - Inline messages
- `Notifications` (@mantine/notifications) - Toast messages
- `Modal` / `modals` (@mantine/modals) - Dialog overlays
- `Tooltip` - Hover hints
- `LoadingOverlay` - Full-page loading

**Typography & Icons:**
- Tabler Icons (@tabler/icons-react) - 3000+ icons
- Consistent icon sizing (14px, 16px, 18px, 20px)
- Semantic color usage (blue, green, red, orange, gray)

### 7.2 Custom Shared Components

**EmptyState:**
```
Location: shared/ui/EmptyState.tsx

Purpose: Consistent empty state messaging

Props:
- icon?: ReactNode (default: InboxOff)
- title: string
- description?: string
- action?: { label, onClick }

Usage:
<EmptyState
  icon={<IconFiles size={32} />}
  title="No documents yet"
  description="Get started by creating your first document"
  action={{ label: "Create Document", onClick: handleCreate }}
/>
```

**PageBreadcrumbs:**
```
Location: shared/ui/PageBreadcrumbs.tsx

Purpose: Navigation breadcrumbs

Props:
- items: Array<{ label: string, href?: string }>

Usage:
<PageBreadcrumbs
  items={[
    { label: 'Documents', href: '/documents' },
    { label: 'Document Title' }
  ]}
/>
```

### 7.3 Layout Widgets

**Header:**
- Location: widgets/header/ui/Header.tsx
- Sticky top positioning
- Logo, navigation toggle, theme switcher, user menu
- Responsive behavior

**Sidebar:**
- Location: widgets/sidebar/ui/Sidebar.tsx
- Role-based navigation items
- Nested menu support
- Active state management
- Mobile drawer

**MainLayout:**
- Location: widgets/layout/ui/MainLayout.tsx
- Combines Header + Sidebar + Content
- AppShell wrapper
- Responsive configurations

### 7.4 Feature-Specific Components

**Document Management:**
- `DocumentUserManagement` - User access modal
- `FilesTable` - Document files list
- `FileUploadZone` - Drag-drop upload
- `UploadProgress` - File upload progress

**Retrieval:**
- `SearchBar` - Query input with advanced options
- `AdvancedOptions` - Collapsible settings
- `ContextCard` - Search result display
- `ContextList` - Results container

**Evaluation:**
- `MetricsCard` - RAGAS metric display
- `ResultsTable` - Evaluation results
- `QuestionDetailModal` - Detailed question view

**User Management:**
- `UserManagementTable` - User list with actions

**Tokens:**
- `PersonalTokensList` - Token table
- `CreateTokenModal` - Token creation
- `TokenCreatedModal` - One-time token display
- `RevokeTokenModal` - Deletion confirmation

### 7.5 Design System Conventions

**Color Palette:**
- Primary: Blue (Mantine default)
- Success: Green
- Warning: Yellow/Orange
- Error: Red
- Neutral: Gray

**Spacing Scale:**
- xs: 10px
- sm: 12px
- md: 16px
- lg: 20px
- xl: 24px

**Typography:**
- Titles: order={1-6}
- Body: size="sm" | "md" | "lg"
- Dimmed text: c="dimmed"
- Monospace: ff="monospace" (for tokens, IDs)

**Interactive States:**
- Hover: Subtle elevation/color change
- Active: Bold highlight
- Disabled: Reduced opacity
- Loading: Skeleton or spinner

**Responsive Breakpoints:**
- xs: 576px
- sm: 768px
- md: 992px
- lg: 1200px
- xl: 1408px

---

## 8. User Flows & Wireframes

### 8.1 Document Upload Flow

```
Start: User on Document Details Page
    │
    ▼
┌──────────────────────────────────┐
│  Click "Upload Files" button     │
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  Upload Modal Opens               │
│  ┌──────────────────────────────┐│
│  │ Drag files here or click     ││
│  │ to browse                    ││
│  │                              ││
│  │ [📁 Select Files]            ││
│  └──────────────────────────────┘│
└──────────────────────────────────┘
    │
    ▼
User Selects Files
    │
    ├─▶ File < 5MB ──▶ Simple Upload
    │       │
    │       ├─▶ Request presigned URL
    │       ├─▶ Upload to MinIO
    │       ├─▶ Progress bar updates
    │       ├─▶ Confirm upload
    │       └─▶ Success notification
    │
    └─▶ File ≥ 5MB ──▶ Multipart Upload
            │
            ├─▶ Init multipart
            ├─▶ Split into 5MB chunks
            ├─▶ Upload chunks in parallel
            ├─▶ Progress bar aggregates
            ├─▶ Complete multipart
            └─▶ Success notification
    │
    ▼
┌──────────────────────────────────┐
│  Files appear in table            │
│  Status: "pending"                │
└──────────────────────────────────┘
    │
    ▼
Backend Indexing Pipeline Processes
    │
    ├─▶ Status: "processing" (blue)
    │
    ├─▶ Success: "indexed" (green)
    │   └─▶ File ready for retrieval
    │
    └─▶ Failure: "failed" (red)
        └─▶ Show error, offer retry
```

### 8.2 Search & Retrieval Flow

```
Start: User on Retrieval Page
    │
    ▼
┌────────────────────────────────────────┐
│ Enter query in textarea                │
│ "What is RAG?"                         │
└────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────┐
│ (Optional) Adjust advanced options:    │
│ • Top K: 10                            │
│ • Mode: Retrieval Only                 │
│ • Use Cache: ✓                         │
└────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────┐
│ Click "Tìm kiếm" or Ctrl+Enter        │
└────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────┐
│ Loading state:                         │
│ • Disable input/button                 │
│ • Show spinner                         │
│ • "Đang tìm kiếm tài liệu..."         │
└────────────────────────────────────────┘
    │
    ▼
Backend Processing:
    ├─▶ Check semantic cache
    │   ├─▶ Hit: Return cached results (fast)
    │   └─▶ Miss: Query vector database
    │
    ├─▶ Retrieve top K contexts
    ├─▶ Rank by relevance
    └─▶ Filter by user permissions
    │
    ▼
┌────────────────────────────────────────┐
│ Results Display:                       │
│                                        │
│ [10 contexts] [245ms] [Cache Hit]     │
│                                        │
│ ┌────────────────────────────────────┐│
│ │ Context Card 1                     ││
│ │ Score: 0.95 (green)                ││
│ │ "RAG systems combine..."           ││
│ │ Source: rag-guide.pdf | Page 3     ││
│ └────────────────────────────────────┘│
│                                        │
│ ┌────────────────────────────────────┐│
│ │ Context Card 2                     ││
│ │ Score: 0.89 (blue)                 ││
│ │ "Benefits include..."              ││
│ │ Source: benefits.pdf | Page 12     ││
│ └────────────────────────────────────┘│
│                                        │
│ ... (more contexts)                    │
└────────────────────────────────────────┘
    │
    ▼
User Actions:
    ├─▶ Click document title → View document
    ├─▶ Click "File" link → Download file
    ├─▶ Expand card → View full context
    └─▶ New search → Repeat flow
```

### 8.3 Evaluation Run Flow

```
Start: SUPER_ADMIN on Evaluation Dashboard
    │
    ▼
┌────────────────────────────────────────┐
│ Click "New Evaluation" button          │
└────────────────────────────────────────┘
    │
    ▼
Navigate to /evaluation/run
    │
    ▼
┌────────────────────────────────────────┐
│ Run Evaluation Page                    │
│                                        │
│ Select Dataset: [Q&A Test Set ▼]     │
│                 (150 questions)        │
│                                        │
│ Configuration:                         │
│ • Top K: [10]                         │
│ • Use Cache: ☐                        │
│ • Timeout: [30s]                      │
│                                        │
│ Advanced:                              │
│ • Parallel: [1]                       │
│ • Retry Failed: ☑                     │
│                                        │
│        [Cancel] [Start Evaluation]    │
└────────────────────────────────────────┘
    │
    ▼
Validation:
    ├─▶ Dataset selected? → Yes
    └─▶ All required fields? → Yes
    │
    ▼
┌────────────────────────────────────────┐
│ POST /evaluation/jobs                  │
│ Creates new job in backend             │
└────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────┐
│ Redirect to Job History                │
│ or stay on page with progress          │
└────────────────────────────────────────┘
    │
    ▼
Backend Worker Processes Job:
    │
    ├─▶ Status: "pending" (gray)
    │
    ├─▶ Status: "running" (blue)
    │   │
    │   ├─▶ For each question:
    │   │   ├─▶ Retrieve contexts
    │   │   ├─▶ Calculate metrics
    │   │   └─▶ Store results
    │   │
    │   └─▶ Progress: 45/150 questions
    │
    ├─▶ Status: "completed" (green)
    │   └─▶ Calculate aggregate metrics
    │
    └─▶ Status: "failed" (red)
        └─▶ Log error details
    │
    ▼
┌────────────────────────────────────────┐
│ User checks Job History                │
│ Sees completed job                     │
│ Click "View Results"                   │
└────────────────────────────────────────┘
    │
    ▼
Navigate to Evaluation Dashboard
    │
    ▼
┌────────────────────────────────────────┐
│ Comprehensive Results Display          │
│ • Metric cards                         │
│ • Statistics                           │
│ • Results table                        │
│ • Export options                       │
└────────────────────────────────────────┘
```

---

## 9. Data Models & API Integration

### 9.1 Core Entity Types

**User:**
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole; // SUPER_ADMIN | ADMIN | USER
}

enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  USER = 'USER',
}
```

**Document:**
```typescript
interface Document {
  id: string;
  title: string;
  description?: string;
  type: 'public' | 'restricted';
  fileCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface DocumentDetailsResponse extends Document {
  files: File[];
}
```

**File:**
```typescript
interface File {
  id: string;
  filename: string;
  filesize: number;
  contentType: string;
  status: 'pending' | 'processing' | 'indexed' | 'failed';
  uploadedAt: string;
  md5Hash?: string;
  documentId: string;
  errorMessage?: string;
}
```

**Personal Access Token:**
```typescript
interface PersonalToken {
  id: number;
  name: string;
  prefix: string; // First 10 chars: "ltv_abc123..."
  lastUsedAt?: string;
  expiresAt?: string;
  isExpired: boolean;
  createdAt: string;
}
```

**Retrieval Context:**
```typescript
interface Context {
  chunkId: string;
  text: string;
  score: number; // 0.0 - 1.0
  documentTitle: string;
  documentId: string;
  filename: string;
  fileId: string;
  pageNumber?: number;
  metadata?: Record<string, unknown>;
}

interface RetrievalResponse {
  contexts: Context[];
  metrics: {
    totalDuration: number; // milliseconds
    cacheHit: boolean;
  };
}
```

**Evaluation Types:**
```typescript
interface EvaluationRun {
  run_id: string;
  dataset_name: string;
  dataset_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  completed_at?: string;
}

interface EvaluationOverview {
  avg_context_precision: number;
  avg_context_recall: number;
  avg_context_relevancy: number;
  overall_score: number;
  total_questions: number;
  completed_questions: number;
  failed_questions: number;
  success_rate: number;
  processing_time_ms: number;
  avg_time_per_question_ms: number;
}

interface EvaluationResult {
  result_id: string;
  question: string;
  ground_truth?: string;
  context_precision: number;
  context_recall: number;
  context_relevancy: number;
  status: 'success' | 'failed';
  error_message?: string;
  retrieved_contexts: Array<{
    rank: number;
    text: string;
    relevant: boolean;
    score: number;
  }>;
}
```

### 9.2 API Endpoints Structure

**Base URL:** Configured via `VITE_API_URL` environment variable

**Authentication:**
```
POST /auth/google - Initiate Google OAuth
GET /auth/callback - OAuth callback handler
POST /auth/refresh - Refresh access token
POST /auth/logout - Logout
GET /auth/me - Get current user
```

**Documents:**
```
GET /documents - List documents (paginated, searchable, filterable)
POST /documents - Create document
GET /documents/:id - Get document details
PATCH /documents/:id - Update document
DELETE /documents/:id - Delete document

GET /documents/:id/users - List document users
POST /documents/:id/users - Add user access
DELETE /documents/:id/users/:userId - Remove user access
```

**Files:**
```
POST /files/documents/:documentId/presigned-url - Get upload URL (simple)
POST /files/documents/:documentId/init-multipart - Init multipart upload
POST /files/:fileId/confirm-upload - Confirm simple upload
POST /files/:fileId/complete-multipart - Complete multipart upload
GET /files/:fileId/download - Get download URL
DELETE /files/:fileId - Delete file
POST /files/:fileId/retry - Retry failed indexing
GET /files/documents/:documentId/with-status - Get files with indexing status
```

**Retrieval:**
```
POST /retrieval/query - Perform search
  Body: {
    query: string,
    topK: number,
    mode: 'retrieval_only' | 'generation',
    useCache: boolean
  }
```

**Evaluation:**
```
GET /evaluation/runs/latest - Get latest run
GET /evaluation/runs/:runId/overview - Get run metrics
GET /evaluation/runs/:runId/results - Get results (paginated)
GET /evaluation/results/:resultId - Get result detail
POST /evaluation/jobs - Create evaluation job
GET /evaluation/jobs - List all jobs
GET /evaluation/runs/:runId/export - Export results

GET /evaluation/datasets - List datasets
POST /evaluation/datasets - Create dataset
GET /evaluation/datasets/:datasetId/questions - List questions
POST /evaluation/datasets/:datasetId/questions - Add question
POST /evaluation/datasets/:datasetId/questions/generate - AI generate questions
```

**User Management:**
```
GET /users - List all users (SUPER_ADMIN only)
PATCH /users/:userId/role - Update user role
GET /users/:userId/tokens - List user's tokens (admin)
DELETE /users/:userId/tokens/:tokenId - Revoke token (admin)
GET /users/:userId/sessions - List user's sessions (admin)
DELETE /users/:userId/sessions/:sessionId - Revoke session (admin)
```

**Personal Tokens:**
```
GET /tokens - List own tokens
POST /tokens - Create token
DELETE /tokens/:tokenId - Revoke own token
```

### 9.3 API Error Handling

**Frontend Pattern:**
```typescript
try {
  const result = await api.someEndpoint();
  // Success handling
  notifications.show({
    title: 'Success',
    message: 'Operation completed',
    color: 'green',
  });
} catch (error) {
  notifications.show({
    title: 'Error',
    message: getErrorMessage(error) || 'Operation failed',
    color: 'red',
  });
}
```

**Error Response Format:**
```typescript
interface APIError {
  statusCode: number;
  message: string;
  error?: string;
}
```

**HTTP Status Codes:**
- 200: Success
- 201: Created
- 400: Bad Request (validation error)
- 401: Unauthorized (invalid/expired token)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 500: Internal Server Error

---

## 10. Design Patterns & Conventions

### 10.1 Component Organization Pattern

**Feature-Sliced Design Layers:**
```
1. app/ - Application initialization
2. pages/ - Route components
3. features/ - Business logic features
4. entities/ - Domain models
5. shared/ - Reusable utilities
```

**Dependencies Flow (Top → Bottom):**
- App can import from all layers
- Pages can import features, entities, shared
- Features can import entities, shared
- Entities can import shared
- Shared imports nothing

### 10.2 State Management Patterns

**Global State (AuthContext):**
- User authentication state
- JWT token management
- User profile data
- Singleton context provider

**Local State (useState):**
- Component-specific data
- Form inputs
- UI toggles
- Temporary data

**Server State (API calls):**
- Fetched data
- No client-side caching library
- Manual refetch on mutations
- Loading/error states per component

**Form State (@mantine/form):**
- Form values
- Validation rules
- Error messages
- Submit handling

### 10.3 Naming Conventions

**Files:**
- Components: PascalCase (e.g., `LoginPage.tsx`)
- Utilities: camelCase (e.g., `getErrorMessage.ts`)
- Types: PascalCase (e.g., `types.ts`, contents PascalCase)
- Constants: UPPER_SNAKE_CASE (e.g., `ROUTES`)

**Components:**
- Functional components with named exports
- Props interface named `ComponentNameProps`
- Event handlers prefixed with `handle` (e.g., `handleSubmit`)

**API Functions:**
- Grouped in objects (e.g., `documentsApi.getDocuments()`)
- Async functions returning promises
- Typed request/response

**Hooks:**
- Prefix with `use` (e.g., `useAuth`, `useRetrievalQuery`)
- Return objects, not arrays (better naming)
- Co-locate with features

### 10.4 Error Handling Pattern

**User-Facing Errors:**
- Always show toast notifications
- Provide clear error messages
- Offer retry actions when applicable
- Log to console for debugging

**Example:**
```typescript
try {
  await documentsApi.deleteDocument(id);
  notifications.show({
    title: 'Success',
    message: 'Document deleted',
    color: 'green',
  });
} catch (error) {
  notifications.show({
    title: 'Error',
    message: getErrorMessage(error) || 'Delete failed',
    color: 'red',
  });
  console.error('Delete document error:', error);
}
```

### 10.5 Loading State Pattern

**Component-Level Loading:**
```typescript
const [loading, setLoading] = useState(false);

const handleAction = async () => {
  setLoading(true);
  try {
    await api.action();
  } finally {
    setLoading(false);
  }
};

return <Button loading={loading}>Action</Button>;
```

**Page-Level Loading:**
```typescript
if (!data) {
  return <LoadingOverlay visible />;
}
```

**Suspense Boundaries:**
```typescript
<Suspense fallback={<PageLoader />}>
  <LazyComponent />
</Suspense>
```

---

## 11. Pain Points & Opportunities

### 11.1 Current Limitations

**Performance Issues:**
1. **No Client-Side Caching:**
   - API data refetched on every mount
   - Slow navigation between pages
   - Unnecessary server load
   - Opportunity: Implement React Query or SWR

2. **Large Bundle Size:**
   - All Mantine components imported
   - No tree-shaking optimization
   - Lazy loading only at route level
   - Opportunity: Optimize imports, code split features

3. **Inefficient Re-renders:**
   - Context changes trigger wide re-renders
   - No memoization of expensive computations
   - Opportunity: Add React.memo, useMemo, useCallback

**UX Friction Points:**
1. **Search Experience:**
   - No search history
   - No query suggestions
   - No saved searches
   - Vietnamese UI but mixed language content
   - Opportunity: Add search enhancements

2. **File Upload:**
   - No resume capability on failure
   - No preview before upload
   - Limited file type validation feedback
   - Opportunity: Enhanced upload UX

3. **Navigation:**
   - No breadcrumbs on all pages
   - No "back" button consistency
   - Deep links not shareable with state
   - Opportunity: Improved navigation patterns

4. **Empty States:**
   - Some pages lack empty state guidance
   - No onboarding for new users
   - Opportunity: Better empty states and tours

**Mobile Experience:**
1. **Responsive Issues:**
   - Tables don't scroll well on mobile
   - Modals can be cramped on small screens
   - Touch targets sometimes too small
   - Opportunity: Mobile-first redesign

2. **Touch Interactions:**
   - No swipe gestures
   - Long-press actions missing
   - Opportunity: Native-like mobile interactions

**Accessibility Gaps:**
1. **Screen Reader Support:**
   - Missing ARIA labels on many interactive elements
   - Insufficient focus management in modals
   - Opportunity: Full WCAG 2.1 AA compliance

2. **Keyboard Navigation:**
   - Not all actions keyboard accessible
   - Focus traps not consistently implemented
   - Opportunity: Comprehensive keyboard support

**Developer Experience:**
1. **Type Safety:**
   - API responses not fully typed
   - Some `any` types in codebase
   - Opportunity: Strict TypeScript configuration

2. **Testing:**
   - Minimal test coverage
   - No E2E tests
   - Opportunity: Comprehensive testing strategy

3. **Documentation:**
   - Component usage not documented
   - API integration patterns unclear
   - Opportunity: Storybook + API docs

### 11.2 Feature Gaps

**Missing Capabilities:**
1. **Bulk Operations:**
   - Can't select multiple documents/files
   - No batch upload
   - No bulk delete
   - Opportunity: Add selection + bulk actions

2. **Advanced Search:**
   - No filters (by date, document type, etc.)
   - No faceted search
   - No search within results
   - Opportunity: Elasticsearch-style filters

3. **Collaboration:**
   - No comments on documents
   - No activity feed
   - No notifications
   - Opportunity: Social/collaborative features

4. **Versioning:**
   - No document version history
   - Can't revert to previous versions
   - Opportunity: Version control system

5. **Analytics:**
   - No usage analytics
   - No search query analytics
   - No user behavior tracking
   - Opportunity: Analytics dashboard

6. **Export/Import:**
   - Limited export options
   - No import from external sources
   - Opportunity: Comprehensive data portability

### 11.3 Security Considerations

**Current Implementation:**
- JWT stored in localStorage (XSS vulnerable)
- No CSP headers mentioned
- No rate limiting visible
- Token refresh logic complex

**Opportunities:**
- Consider httpOnly cookies for tokens
- Implement CSP
- Add rate limiting feedback
- Simplify token refresh

---

## 12. Redesign Recommendations

### 12.1 High-Priority Improvements

**1. Implement Client-Side Caching**
- Add React Query or SWR
- Cache API responses
- Optimistic updates
- Background refetch
- Stale-while-revalidate pattern

**2. Enhanced Search Experience**
```
Proposed Features:
- Search history dropdown
- Query suggestions as you type
- Saved searches
- Advanced filters panel
  - Date range
  - Document type
  - File type
  - Tags
- Search within results
- Export search results
```

**3. Improved File Upload**
```
Enhanced Upload UI:
- Drag-drop with preview
- Multi-file selection with thumbnails
- Upload queue management
- Pause/resume capability
- Error recovery
- File type previews (PDF, images, etc.)
```

**4. Mobile-First Redesign**
```
Mobile Optimizations:
- Responsive DataTable → Card list on mobile
- Bottom sheet modals on mobile
- Swipe actions (delete, edit)
- Touch-optimized controls (min 44px targets)
- Collapsible sections
- Mobile navigation menu
```

**5. Accessibility Audit & Fixes**
```
Accessibility Roadmap:
- Add ARIA labels to all interactive elements
- Implement focus management
- Keyboard shortcuts documentation
- High contrast mode
- Screen reader testing
- WCAG 2.1 AA compliance
```

### 12.2 UI/UX Enhancements

**Dashboard Redesign:**
```
New Dashboard Features:
- Recent activity feed
- Quick stats cards
  - Total documents
  - Recent searches
  - Indexing queue status
- Favorite documents
- Recent documents list
- System health indicators
```

**Document Management Improvements:**
```
Enhanced Features:
- Grid/list view toggle
- Drag-drop file organization
- Document tags/categories
- Bulk operations toolbar
- Advanced filtering
- Sort by multiple columns
- Document preview pane
```

**Evaluation Dashboard Enhancements:**
```
Advanced Analytics:
- Metric trends over time (charts)
- Compare multiple runs
- Question difficulty analysis
- Context quality heatmap
- Export to multiple formats
  - PDF report
  - CSV detailed
  - JSON raw data
- Scheduled evaluations
```

### 12.3 New Feature Proposals

**1. Document Versioning**
```
Feature: Track document and file changes
- Version history timeline
- Diff view between versions
- Restore previous versions
- Version tagging
- Change annotations
```

**2. Collaboration Tools**
```
Feature: Team collaboration
- Document comments
- @mentions
- Activity feed
- Real-time presence indicators
- Share links with permissions
```

**3. Advanced Analytics**
```
Feature: Usage insights
- Search query analytics
- Popular documents
- User activity dashboard
- System performance metrics
- Custom reports builder
```

**4. Notification System**
```
Feature: Real-time alerts
- Indexing completion
- Evaluation results ready
- Document shared with you
- Permission changes
- System announcements
- In-app + email notifications
```

**5. API Documentation**
```
Feature: Developer portal
- Interactive API docs (Swagger/OpenAPI)
- Code examples in multiple languages
- Rate limit information
- Webhook configuration
- SDK downloads
```

### 12.4 Visual Design Refinements

**Typography Improvements:**
- Establish type scale
- Consistent heading hierarchy
- Improved readability (line height, letter spacing)
- Custom font selection

**Color System:**
- Expanded color palette
- Semantic color usage
- Dark mode optimizations
- Better contrast ratios

**Spacing System:**
- Consistent spacing scale
- Improved white space usage
- Better visual hierarchy
- Grid system documentation

**Iconography:**
- Custom icon set for brand consistency
- Icon size standardization
- Icon + text alignment
- Loading state animations

### 12.5 Performance Optimizations

**Code Splitting:**
- Split by feature, not just route
- Lazy load heavy components (DataTable, Modals)
- Dynamic imports for icons
- Vendor chunk optimization

**Bundle Size:**
- Tree-shake Mantine imports
- Analyze and eliminate unused dependencies
- Compress assets
- Use CDN for static assets

**Rendering Optimizations:**
- Virtualized lists for large datasets
- Debounce/throttle expensive operations
- Memo expensive components
- Optimize re-render triggers

**Loading Strategy:**
- Skeleton screens instead of spinners
- Progressive enhancement
- Prefetch on hover
- Service worker for offline support

---

## 13. Conclusion

The **LTV Assistant CMS** is a well-architected, feature-rich application built with modern React practices and the Mantine UI framework. It successfully implements a comprehensive RAG system management interface with role-based access control, document lifecycle management, intelligent retrieval, and advanced evaluation capabilities.

**Strengths:**
- Clean Feature-Sliced Design architecture
- Comprehensive role-based permissions
- Sophisticated file upload handling
- Advanced evaluation system with RAGAS metrics
- Type-safe TypeScript implementation
- Mantine UI for consistent design

**Areas for Improvement:**
- Client-side caching implementation
- Mobile experience optimization
- Accessibility enhancements
- Performance optimizations
- Feature additions (versioning, collaboration, analytics)

This documentation provides designers with a complete understanding of the current system, enabling informed redesign decisions that maintain functionality while improving user experience.

---

**End of Document**

*This comprehensive redesign documentation was created for UI/UX designers to understand the LTV Assistant CMS system in its entirety. All system features, user flows, technical architecture, and redesign opportunities have been documented in detail.*

