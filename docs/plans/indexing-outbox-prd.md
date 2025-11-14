# Indexing Outbox – Design Summary

## Purpose
Establish a reliable outbox mechanism so that document ingestion events can be replayed or recovered without duplicate writes to MySQL and Qdrant.

## Objectives
- Guarantee at-least-once delivery between upload service, storage, and indexing workers.
- Avoid double writes to MySQL metadata tables and Qdrant collections.
- Provide operational tooling to inspect, retry, or poison outbox messages.

## Key Components
| Component | Responsibility |
|-----------|----------------|
| Upload service | Writes file metadata and emits outbox entries |
| Outbox table (MySQL) | Durable queue with status, attempts, payload |
| Indexing worker | Consumes entries, runs pipeline, acknowledges completion |
| Cleanup job | Removes processed/outdated entries, alerts on stuck jobs |

## Flow (High Level)
1. Upload service saves file metadata + payload references to MySQL.
2. Outbox row created with status `pending`.
3. Worker polls outbox, locks row, executes indexing pipeline (Load → Persist).
4. On success: mark row `completed`; on failure: increment attempts, schedule retry.
5. Cleanup job monitors `failed` rows and exposes metrics/alerts.

## Observability
- Prometheus metrics: itemsPending, itemsFailed, averageProcessingTime.
- Logs: structured with requestId/fileId; send to Loki.
- Alerts: threshold on failed percentage and max attempts reached.

## Risks & Mitigation
- **MySQL outage:** Buffer entries in Redis, retry once DB is back.
- **Worker crash mid-job:** Use transactional locks and visibility timeout to release row.
- **Poison messages:** After N retries, move to quarantine queue for manual inspection.

---
*Legacy references to additional data stores have been removed; the outbox now targets MySQL + Qdrant consistency only.*
