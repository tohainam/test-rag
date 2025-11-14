# LTV Assistant

**Enterprise-grade Retrieval-Augmented Generation (RAG) System**

LTV Assistant is a production-ready, microservices-based RAG platform that enables organizations to build intelligent, context-aware AI assistants with fine-grained access control. Built with LangChain.js, LangGraph.js, and NestJS, the system combines advanced document retrieval with state-of-the-art language models to deliver accurate, contextually relevant answers from private document repositories.

---

## Features

### Core Capabilities

- **Intelligent Document Retrieval:** Hybrid search combining vector search (Qdrant) and structured queries (MySQL)
- **Advanced RAG Pipeline:** LangGraph.js workflows with adaptive query refinement and hallucination detection
- **Local Embeddings:** BGE-M3 via TEI for cost-free, 100% private embeddings (1024-dim)
- **Small-to-Big Chunking:** Precise retrieval with child chunks (400 tokens), rich context with parent chunks (1200 tokens)
- **Enterprise Security:** Role-based access control (RBAC), document-level permissions, JWT authentication
- **Scalable Architecture:** TCP microservices (< 5ms latency), Redis caching, horizontal scaling support
- **Admin Dashboard:** React-based CMS with document management, user administration, and access control

### Technical Highlights

- **Microservices Architecture:** API Gateway pattern with 6 independent services
- **Modern Tech Stack:** NestJS, React 19, LangChain.js 1.0+, LangGraph.js 1.0+, Drizzle ORM
- **Multi-Database:** MySQL, Qdrant, Redis, MinIO (S3-compatible)
- **Authentication:** Google OAuth 2.0, JWT tokens, Personal Access Tokens
- **File Storage:** MinIO with presigned URLs, multipart upload support (>100MB files)
- **Developer Experience:** TypeScript throughout, comprehensive API documentation, Docker Compose

---

## Quick Start

### Prerequisites

- **Docker** 24.0+ and **Docker Compose** 2.0+
- **Node.js** 18+ (for development)
- **Google OAuth Credentials** (for authentication)

### 1. Clone Repository

```bash
git clone https://github.com/your-org/ltv-assistant.git
cd ltv-assistant
```

### 2. Start Infrastructure

```bash
docker-compose up -d
```

This starts:
- MySQL (Port 3306)
- Redis (Port 6379)
- MinIO (Ports 9000, 9001)
- phpMyAdmin (Port 8080)
- Redis Insight (Port 5540)
- Ollama (Port 11434)
- Ollama WebUI (Port 3100)
- BullMQ Board (Port 3200)

### 3. Configure Environment Variables

Create `.env` files in each service directory based on `.env.example`:

**api-gateway/.env:**
```env
PORT=50050
AUTH_SERVICE_URL=http://localhost:50051
AUTH_SERVICE_HOST=localhost
AUTH_SERVICE_TCP_PORT=4001
DATASOURCE_SERVICE_URL=http://localhost:50054
RETRIEVAL_SERVICE_URL=http://localhost:50056
```

**ltv-assistant-auth/.env:**
```env
PORT=50051
TCP_PORT=4001
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_NAME=ltv_assistant_auth_db
DATABASE_USER=root
DATABASE_PASSWORD=root
JWT_SECRET=your-jwt-secret-change-in-production
JWT_EXPIRES_IN=15m
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:50050/auth/google/callback
FRONTEND_URL=http://localhost:30000
```

**ltv-assistant-datasource/.env:**
```env
PORT=50054
TCP_PORT=4004
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_NAME=ltv_assistant_datasource_db
DATABASE_USER=root
DATABASE_PASSWORD=root
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=documents
AUTH_SERVICE_HOST=localhost
AUTH_SERVICE_TCP_PORT=4001
```

**ltv-assistant-cms/.env:**
```env
VITE_API_URL=http://localhost:50050
```

### 4. Install Dependencies

```bash
# Install dependencies for all services
cd api-gateway && npm install && cd ..
cd ltv-assistant-auth && npm install && cd ..
cd ltv-assistant-cms && npm install && cd ..
cd ltv-assistant-datasource && npm install && cd ..
cd ltv-assistant-indexing && npm install && cd ..
cd ltv-assistant-retrieval && npm install && cd ..
```

### 5. Run Database Migrations

**Important:** Each service uses its own separate MySQL database. You need to run migrations for each service independently.

**Databases:**
- `ltv_assistant_auth_db` - Auth Service (users, tokens)
- `ltv_assistant_datasource_db` - Datasource Service (documents, files)
- `ltv_assistant_indexing_db` - Indexing Service (chunks, lineage - Planned)

```bash
# Auth service - Creates ltv_assistant_auth_db database
cd ltv-assistant-auth
npm run db:push

# Datasource service - Creates ltv_assistant_datasource_db database
cd ../ltv-assistant-datasource
npm run db:push
```

**Note:** The services do NOT share a database. Cross-service data access is handled via TCP microservices.

### 6. Start Services

**Terminal 1 - API Gateway:**
```bash
cd api-gateway
npm run start:dev
```

**Terminal 2 - Auth Service:**
```bash
cd ltv-assistant-auth
npm run start:dev
```

**Terminal 3 - Datasource Service:**
```bash
cd ltv-assistant-datasource
npm run start:dev
```

**Terminal 4 - Admin CMS:**
```bash
cd ltv-assistant-cms
npm run dev
```

### 7. Access the Application

- **Admin CMS:** http://localhost:30000
- **API Gateway:** http://localhost:50050
- **phpMyAdmin:** http://localhost:8080 (user: `root`, password: `root`)
- **MinIO Console:** http://localhost:9001 (user: `minioadmin`, password: `minioadmin`)
- **Redis Insight:** http://localhost:5540
- **Ollama WebUI:** http://localhost:3100
- **BullMQ Dashboard:** http://localhost:3200

### 8. Create First Admin User

1. Navigate to http://localhost:30000
2. Click "Login with Google"
3. After successful login, manually update the user role in MySQL:

```sql
UPDATE users SET role = 'SUPER_ADMIN' WHERE email = 'your-email@example.com';
```

---

## Architecture Overview

LTV Assistant follows a microservices architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                            │
│  React Admin CMS (30000)    External API Consumers          │
└───────────────────┬──────────────────────┬──────────────────┘
                    │                      │
                    ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  API Gateway (50050)                        │
│  Authentication Middleware + Request Routing                │
└──────┬───────────┬───────────┬──────────────┬───────────────┘
       │           │           │              │
       ▼           ▼           ▼              ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│   Auth   │ │Datasource│ │ Indexing │ │  Retrieval   │
│  (50051) │ │ (50054)  │ │ (50055)  │ │  (50056)     │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬────────┘
     │            │            │              │
     ▼            ▼            ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                             │
│  MySQL    MinIO    Qdrant    Redis                        │
└─────────────────────────────────────────────────────────────┘
```

### Services

- **API Gateway (50050):** Single entry point, authentication, routing
- **Auth Service (50051/4001):** Google OAuth, JWT tokens, user management
- **Datasource Service (50054/4004):** Document metadata, MinIO file storage
- **Indexing Service (50055/4005):** LangChain.js document processing, embeddings
- **Retrieval Service (50056/4006):** LangGraph.js RAG pipeline, query processing
- **Admin CMS (30000):** React-based admin interface

---

## Documentation

Comprehensive documentation is available in the `/docs` directory:

- **[Project Overview & PDR](docs/project-overview-pdr.md)** - Business objectives, features, success metrics
- **[Codebase Summary](docs/codebase-summary.md)** - Detailed service breakdown, technology stack
- **[Code Standards](docs/code-standards.md)** - Coding conventions, best practices, patterns
- **[System Architecture](docs/system-architecture.md)** - Architecture decisions, communication patterns, databases
- **[Diagrams](docs/diagrams.md)** - Visual representations, mermaid diagrams (MOST COMPREHENSIVE)
- **[RAG Flow](docs/rag-flow.md)** - Complete RAG pipeline documentation

### Key Documents for Developers

1. **Getting Started:** Start with [Project Overview](docs/project-overview-pdr.md)
2. **Understanding the Code:** Read [Codebase Summary](docs/codebase-summary.md)
3. **Visual Learning:** Check [Diagrams](docs/diagrams.md) for comprehensive visual representations
4. **Development:** Follow [Code Standards](docs/code-standards.md)
5. **RAG Pipeline:** Study [RAG Flow](docs/rag-flow.md) for LangChain/LangGraph implementation

---

## Development

### Running Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

### Code Quality

```bash
# Lint
npm run lint

# Format
npm run format

# Type check
npm run build
```

### Database Migrations

```bash
# Generate migration
npm run db:generate

# Apply migration
npm run db:push

# Open Drizzle Studio
npm run db:studio
```

---

## Technology Stack

### Backend

- **Framework:** NestJS 11.0.1
- **Language:** TypeScript 5.7.3
- **ORM:** Drizzle ORM 0.44.7
- **Authentication:** Passport.js + Google OAuth + JWT
- **Validation:** class-validator + class-transformer
- **Testing:** Jest 30.0.0

### Frontend

- **Framework:** React 19.2.0
- **Build Tool:** Vite 7.1.9
- **UI Library:** Mantine 8.3.6
- **Routing:** React Router DOM 7.9.4
- **HTTP Client:** Axios 1.13.1
- **Testing:** Vitest 4.0.0

### RAG Stack

- **Framework:** LangChain.js 1.0+ + LangGraph.js 1.0+
- **Embeddings:** BGE-M3 via TEI (1024-dim, local)
- **LLM:** OpenAI GPT-4 or Ollama (local)
- **Vector DB:** Qdrant
- **Cache:** Redis 7

### Databases

**Database-per-Service Architecture:**
- **MySQL 8.0:** Separate databases per service
  - `ltv_assistant_auth_db` (Auth): users, refresh_tokens, personal_access_tokens
  - `ltv_assistant_datasource_db` (Datasource): documents, files, document_whitelist
  - `ltv_assistant_indexing_db` (Indexing - Planned): chunks, chunk_lineage
- **Redis 7:** Caching, sessions, LangGraph checkpoints
- **MinIO:** S3-compatible object storage
- **Qdrant:** Vector database (embeddings)

**Note:** Services communicate via TCP microservices for cross-database references, not direct database foreign keys.

---

## Deployment

### Docker Compose (Development)

```bash
# Start all infrastructure services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Production Deployment

Detailed deployment guides coming soon. Key considerations:

- **Container Orchestration:** Kubernetes or Docker Swarm
- **Load Balancing:** Nginx or Traefik
- **SSL/TLS:** Let's Encrypt certificates
- **Monitoring:** Prometheus + Grafana
- **Logging:** ELK Stack or Loki

---

## API Documentation

### Authentication

**Login with Google:**
```
GET /auth/google
```

**Get Current Session:**
```
GET /auth/session
Authorization: Bearer {jwt}
```

**Refresh Token:**
```
POST /auth/refresh
Cookie: refresh_token={token}
```

**Logout:**
```
POST /auth/logout
Authorization: Bearer {jwt}
```

### Documents

**List Documents:**
```
GET /documents?page=1&limit=10&search=keyword&type=public&status=active
Authorization: Bearer {jwt}
```

**Create Document:**
```
POST /documents
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "title": "Document Title",
  "description": "Optional description",
  "type": "public" | "restricted"
}
```

**Get Document:**
```
GET /documents/:id
Authorization: Bearer {jwt}
```

**Update Document:**
```
PATCH /documents/:id
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "title": "Updated Title",
  "description": "Updated description"
}
```

**Delete Document:**
```
DELETE /documents/:id
Authorization: Bearer {jwt}
```

### File Upload

**Single File Upload:**
```
POST /files/single
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "documentId": "uuid",
  "filename": "example.pdf",
  "fileSize": 1048576,
  "mimeType": "application/pdf"
}

Response:
{
  "fileId": "uuid",
  "uploadUrl": "https://minio:9000/documents/..."
}

# Client uploads to uploadUrl via PUT

POST /files/single/confirm
{
  "fileId": "uuid"
}
```

**Multipart Upload:**
```
POST /files/multipart/init
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "documentId": "uuid",
  "filename": "large-file.pdf",
  "fileSize": 524288000,
  "mimeType": "application/pdf"
}

Response:
{
  "fileId": "uuid",
  "uploadId": "minio-upload-id",
  "partUrls": [
    { "partNumber": 1, "url": "https://..." },
    { "partNumber": 2, "url": "https://..." }
  ]
}

# Client uploads each part, collects ETags

POST /files/multipart/complete
{
  "fileId": "uuid",
  "uploadId": "minio-upload-id",
  "parts": [
    { "partNumber": 1, "etag": "etag-1" },
    { "partNumber": 2, "etag": "etag-2" }
  ]
}
```

---

## Security

### Authentication Methods

1. **Google OAuth 2.0:** Primary authentication for web users
2. **JWT Tokens:** 15-minute access tokens for API requests
3. **Refresh Tokens:** 7-day refresh tokens for session persistence
4. **Personal Access Tokens:** Long-lived API keys for programmatic access

### Role-Based Access Control

- **SUPER_ADMIN:** Full system access, user management
- **ADMIN:** Document management, create restricted documents
- **USER:** View public documents, access whitelisted documents

### Security Best Practices

- All passwords hashed with bcrypt (for future password auth)
- Personal tokens stored as SHA-256 hashes
- JWT tokens signed with RS256
- HTTPS enforced in production
- CORS configured for trusted origins
- Anti-spoofing: Gateway strips client-provided headers
- SQL injection prevention: Parameterized queries (Drizzle ORM)

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch:** `git checkout -b feature/your-feature`
3. **Follow code standards:** See [docs/code-standards.md](docs/code-standards.md)
4. **Write tests:** Ensure coverage for new features
5. **Run linting:** `npm run lint`
6. **Commit with conventional commits:** `feat: add new feature`
7. **Submit a pull request**

### Development Workflow

1. Read [Code Standards](docs/code-standards.md)
2. Study [System Architecture](docs/system-architecture.md)
3. Review [Diagrams](docs/diagrams.md) for visual understanding
4. Check existing code patterns in [Codebase Summary](docs/codebase-summary.md)
5. Write code following established patterns
6. Add comprehensive tests
7. Update documentation if needed

---

## Roadmap

### Phase 1: Core Infrastructure (Completed)
- ✅ Microservices architecture
- ✅ Google OAuth authentication
- ✅ API Gateway with routing
- ✅ MySQL database with Drizzle ORM
- ✅ MinIO file storage
- ✅ React Admin CMS

### Phase 2: RAG Pipeline (In Progress)
- 🚧 LangChain.js document loaders
- 🚧 LangGraph.js workflow management
- 🚧 BGE-M3 embeddings via TEI
- 🚧 Qdrant vector database
- 🚧 Hybrid retrieval + reranking

### Phase 3: Advanced Features (Planned)
- ⏳ Real-time collaboration
- ⏳ Document versioning
- ⏳ Advanced analytics dashboard
- ⏳ API rate limiting
- ⏳ Webhook notifications

### Phase 4: Enterprise Features (Future)
- 📅 SSO integration (SAML, LDAP)
- 📅 Multi-tenancy support
- 📅 Advanced audit logging
- 📅 Custom embedding models
- 📅 A/B testing framework

---

## License

[Specify your license here]

---

## Support

For questions, issues, or feature requests:

- **Documentation:** Check `/docs` directory
- **Issues:** Open a GitHub issue
- **Discussions:** Use GitHub Discussions
- **Email:** [your-support-email]

---

## Acknowledgments

- **LangChain.js** - RAG framework
- **LangGraph.js** - Stateful workflow orchestration
- **NestJS** - Backend framework
- **React** - Frontend framework
- **Mantine** - UI component library
- **Qdrant** - Vector database
- **BGE-M3** - Embedding model
- **TEI** - Text Embeddings Inference

---

**Built with ❤️ by [Your Organization]**
