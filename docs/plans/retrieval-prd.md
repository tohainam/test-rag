# Retrieval Service – Product Requirements (Snapshot)

**Last updated:** 2025-11-13  
**Scope:** Retrieval-only pipeline using MySQL metadata and Qdrant vector search.

---

## Goals
- Deliver accurate, latency-aware document retrieval powered by vector search (Qdrant) plus structured metadata filtering (MySQL).
- Support hybrid dense+sparse search, semantic cache, reranking, and enrichment loops.
- Expose consistent APIs for the CMS, Gateway, and analytics services.

## Core Capabilities
1. **Query Analysis & Transformation** – Embedding generation, HyDE, decompositions, and rewrite heuristics.
2. **Access Control** – RBAC-aware filters derived from datasource permissions.
3. **Hybrid Retrieval** – Qdrant vector search combined with MySQL metadata lookups.
4. **Fusion & Reranking** – Reciprocal Rank Fusion followed by cross-encoder reranking.
5. **Enrichment** – Small-to-big context assembly using parent chunks from MySQL.
6. **Semantic Cache** – Qdrant-backed cache with TTL, per-user scopes, and cache invalidation hooks.

## Non-Functional Requirements
- **Latency:** < 1500ms P95 for typical topK=10 queries.
- **Availability:** 99.5% uptime with graceful degradation (cache fallback) if reranker is offline.
- **Security:** Enforce RBAC on every request; redact sensitive metadata.
- **Observability:** Pino logs, OTEL traces, Prometheus metrics (request rate, cache hit ratio, rerank latency).

## APIs
- `POST /retrieval/query` – Executes the workflow and returns contexts + metrics.
- `POST /retrieval/cache/purge` – Clears semantic cache entries by document/file.
- TCP microservice endpoints mirror HTTP for internal callers.

## Data Stores
| Store  | Purpose                    | Notes |
|--------|---------------------------|-------|
| Qdrant | Hybrid dense/sparse search | Collections: `chunks`, `query_cache_public`, `query_cache_private` |
| MySQL  | Metadata and lineage       | Tables: `documents`, `parent_chunks`, `child_chunks`, `chunk_lineage` |
| Redis  | Cache coordination         | Queueing locks, rate limiting |

## Risks & Mitigations
- **Vector drift:** Scheduled recalibration and chunk re-embedding jobs.
- **Cache staleness:** Invalidate on document updates, enforce TTL.
- **Reranker latency:** Batch rerank calls, fallback to RRF when unavailable.

## Roadmap Highlights
- Expand analytics dashboards for per-stage latency tracking.
- Automate quality evaluation via RAGAS scoring service.
- Evaluate streaming updates from the indexing pipeline for near-real-time refresh.

---
*This short-form PRD replaces the legacy draft and reflects the current retrieval architecture.*
