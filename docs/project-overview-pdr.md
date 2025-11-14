# LTV Assistant – Project Overview (2025 Refresh)

## Vision

Deliver an enterprise-ready Retrieval-Augmented Generation (RAG) platform that converts enterprise documents into actionable knowledge. The platform now relies on Qdrant for vector search and MySQL for structured metadata; graph databases are no longer part of the architecture.

## Pillars

1. **Document Ingestion** – Reliable pipeline that chunks, enriches, embeds, and persists content to MySQL + Qdrant.
2. **Hybrid Retrieval** – LangGraph-powered workflow combining semantic search, metadata filters, reranking, and enrichment.
3. **Security & Governance** – RBAC-aware access filters, audit logs, and cache isolation per tenant.
4. **Observability** – OpenTelemetry traces, Prometheus metrics, structured logging, and Grafana dashboards.

## System Architecture

| Layer          | Responsibilities                                         | Key Technologies                         |
| -------------- | -------------------------------------------------------- | ---------------------------------------- |
| Ingestion      | Upload, indexing, enrichment, persistence                | NestJS, BullMQ, MySQL, Qdrant            |
| Retrieval      | Query analysis, hybrid search, semantic cache, reranking | NestJS, LangGraph, Qdrant, Redis, TEI    |
| Experience     | API Gateway, CMS, Auth, MCP server, frontend apps        | NestJS, Next.js/React                    |
| Infrastructure | Storage, messaging, monitoring                           | MinIO, Redis, Prometheus, Grafana, Tempo |

## Data Stores

- **MySQL** – Document metadata, parent/child chunks, lineage, job tracking.
- **Qdrant** – Dense+sparse embeddings for retrieval and semantic cache.
- **Redis** – Semantic cache coordination, rate limits, queue locks.
- **MinIO** – Binary object storage for raw files.

## Services

- **API Gateway** – Unified entry point, authentication forwarding, rate limiting.
- **Auth Service** – JWT + OAuth login flows.
- **Datasource Service** – RBAC policy provider for retrieval filters.
- **Indexing Service** – Multi-stage document processing pipeline.
- **Retrieval Service** – LangGraph workflow delivering final contexts.
- **CMS** – Content management and analytics UI.
- **MCP Server** – Operational tooling for metadata, cache, and vector maintenance.

## Key Workflows

1. **Upload → Index**
   - File stored in MinIO
   - Metadata persisted in MySQL
   - Pipeline transforms chunks, embeds vectors, writes to MySQL + Qdrant
2. **Query → Retrieve**
   - Gateway authenticates request
   - Retrieval workflow performs analysis, hybrid search, rerank, enrichment
   - Results cached semantically when applicable
3. **Cache Invalidation**
   - Triggered via CMS or MCP tools
   - Removes vectors from Qdrant semantic cache collections

## Roadmap Highlights

- Extend semantic cache policies (time- and event-based invalidation).
- Automate evaluation via RAGAS scoring pipeline.
- Expand observability dashboards for per-stage latency and cache effectiveness.

---

_Updated: 2025-11-13. Supersedes earlier drafts referencing graph databases._
