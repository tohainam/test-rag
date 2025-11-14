# Persist Stage – Implementation Notes (2025 Refresh)

The persist stage finalises indexing by writing enriched data to MySQL and Qdrant with an all-or-nothing contract.

## Responsibilities
1. **MySQL Persistence**
   - Upsert documents, parent/child chunks, and lineage inside a single transaction.
   - Maintain job tracking tables with attempts, errors, and timestamps.
2. **Qdrant Persistence**
   - Batch upload dense+sparse vectors for children, summaries, and questions.
   - Track counts of inserted vectors for rollback and metrics.
3. **Rollback Strategy**
   - On failure, remove newly created vectors from Qdrant and clean MySQL entities that were inserted in the current attempt.

## Error Handling
- Wrap persistence in try/catch; throw `PersistStageError` for upstream handling.
- Return structured `PersistOutputDto` summarising success flags, counts, duration, and error list.

## Performance Targets
- Insert ≥ 1k child chunks under 30 seconds.
- Keep Qdrant batch size configurable (default 128) to balance throughput and memory usage.

## Metrics & Logging
- Log stage start/end with counts of children, summaries, questions.
- Emit durations for MySQL and Qdrant writes.
- Surface rollback results (success/failure) for observability dashboards.

## Testing Checklist
- Unit tests for MySQL and Qdrant service adapters (success + failure cases).
- Integration test covering end-to-end persist with rollback on induced failure.
- Performance tests with large documents to validate batching settings.

---
*This note supersedes legacy guidance that referenced graph storage. The persist stage now targets only MySQL and Qdrant.*
