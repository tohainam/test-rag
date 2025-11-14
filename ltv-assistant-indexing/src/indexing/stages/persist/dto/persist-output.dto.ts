/**
 * Persist Stage Output DTO
 * Based on specs from docs/plans/persist-stage.md
 */

import type { MySQLPersistenceResult, QdrantPersistenceResult } from '../types';

export interface PersistOutputDto {
  success: boolean;

  // Persistence results from each database
  mysql: MySQLPersistenceResult;
  qdrant: QdrantPersistenceResult;

  // Summary metrics
  totalDurationMs: number;
  rollbackPerformed: boolean;
  errors: string[];
}
