# LTV Assistant Indexing Service – Product Requirements (Snapshot)

**Last updated:** 2025-11-13  
**Status:** Active

---

## Overview
The indexing service ingests raw documents, enriches them, and persists the results to two data stores:

- **MySQL** for metadata, parent/child chunks, and lineage.
- **Qdrant** for dense and sparse vector embeddings used during retrieval.

The original multi-database concept that included a graph store has been retired. This snapshot captures the streamlined scope so that downstream services and stakeholders align on the current architecture.

## High-Level Goals
1. Guarantee all-or-nothing persistence between MySQL and Qdrant.
2. Provide clean APIs for managing indexing jobs and status reporting.
3. Maintain observability, retry safety, and back-pressure across BullMQ workers.

## Functional Requirements
- **Job lifecycle:** Create, update, cancel, and monitor indexing jobs via REST and message queues.
- **Pipeline stages:** Load → Parse → Structure → Chunk → Enrich → Embed → Persist.
- **Persistence:** Store structured metadata in MySQL; store embeddings in Qdrant collections (`chunks`, `query_cache_public`, `query_cache_private`).
- **Cleanup:** Support deletion flows that remove data from both stores.

## Non-Functional Requirements
- **Performance:** Index a typical 20-page document in under 90 seconds under nominal load.
- **Reliability:** Automatic retries with exponential back-off; idempotent persistence operations.
- **Observability:** pino logging, OpenTelemetry traces, Prometheus metrics, and alerting for queue backlogs and failed jobs.
- **Security:** RBAC integration for job management APIs, encrypted credentials, and audit logs for deletion events.

## Data Model Summary
| Store  | Purpose                   | Key Entities / Collections |
|--------|---------------------------|----------------------------|
| MySQL  | Metadata & lineage        | `documents`, `parent_chunks`, `child_chunks`, `chunk_lineage`, `indexing_jobs` |
| Qdrant | Embedding search          | `chunks`, `query_cache_public`, `query_cache_private` |

## APIs
- `POST /indexing/jobs` – Submit a new indexing job.
- `GET /indexing/jobs/:id` – Fetch job status and metrics.
- `DELETE /indexing/files/:fileId` – Remove indexed data across stores.

## Risks & Mitigations
- **Vector persistence failures:** Retry with back-off; run cleanup on partial writes.
- **MySQL contention:** Use connection pooling and batched inserts; monitor slow query logs.
- **Large documents:** Adaptive chunk sizing and streaming ingestion to avoid memory spikes.

## Roadmap Notes
- Finalise automated integration tests for Qdrant cleanup flows.
- Evaluate semantic cache eviction policies driven by document ownership changes.
- Extend observability dashboards with per-stage latency percentiles.

---
*This condensed PRD supersedes earlier drafts and reflects the current deliverables for the indexing service.*
