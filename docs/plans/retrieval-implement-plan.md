# Retrieval Service – Implementation Plan (2025 Refresh)

This plan captures the actionable tasks for maintaining and extending the retrieval workflow built on MySQL, Qdrant, Redis, and TEI reranking.

## Phase 1 – Foundations
- ✅ Build LangGraph workflow (checkCache → analyzeQuery → buildAccessFilter → hybridRetrieval → fusion → rerank → enrich → checkSufficiency → selectMode → updateCache).
- ✅ Implement Qdrant service with dense+sparse hybrid search.
- ✅ Implement MySQL metadata service for parent chunk hydration.
- ✅ Integrate semantic cache (Qdrant collections + Redis orchestration).
- ✅ Wire reranker service (TEI deployment) with graceful fallback to RRF.

## Phase 2 – Enhancements
1. **Observability Upgrade**
   - Add OpenTelemetry spans per workflow node.
   - Publish Prometheus metrics: request latency, cache hit ratio, rerank latency, enrichment latency.
   - Extend Grafana dashboard panels for Qdrant throughput and MySQL query cost.

2. **Adaptive Query Strategies**
   - Fine-tune HyDE and decomposition heuristics with configurable toggles.
   - Implement retry logic for low sufficiency scores (loop guard ≤ 3 iterations).
   - Add instrumentation to capture sufficiency decisions for analytics.

3. **Cache Operations**
   - Implement selective cache invalidation by document ID.
   - Schedule background cleanup (cron job via `@nestjs/schedule`).
   - Provide admin endpoints/CLI to purge or warm the cache.

## Phase 3 – Reliability & Scale
- Horizontal scale for retrieval workers (BullMQ configuration, concurrency tuning).
- Connection pooling checks for Qdrant + MySQL.
- Bulk prefetch of parent chunks to minimise round-trips on enrichment.
- Integration tests simulating high-concurrency queries with varied access filters.

## Deployment Checklist
- [ ] Update `.env` with MySQL, Qdrant, Redis, TEI endpoints.
- [ ] Run `npm run build` in `ltv-assistant-retrieval`.
- [ ] Apply database migrations (Drizzle).
- [ ] Verify Grafana dashboard provisioning.
- [ ] Execute smoke tests via API Gateway and TCP client.

## Risk Log
| Risk | Impact | Mitigation |
|------|--------|------------|
| Qdrant availability | Retrieval downtime | Provision read replicas or backup cluster |
| Redis cache loss | Higher latency | Auto-warm critical items, monitor miss ratio |
| Reranker overload | QoS degradation | Enable adaptive topK for rerank, fallback to RRF |

---
*All references to graph traversal have been removed; future work should continue to focus on vector + metadata retrieval paths.*
