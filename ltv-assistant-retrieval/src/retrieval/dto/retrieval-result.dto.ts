/**
 * Retrieval Result DTO
 * Output from retrieval workflow
 */

import type { Context } from '../types';

export interface RetrievalMetricsDto {
  totalDuration: number;
  cacheHit: boolean;
  qdrantResultCount: number;
  rerankedResultCount: number;
  parentChunkCount: number;
  iterations: number;
  sufficiencyScore: number;
}

export interface RetrievalResultDto {
  contexts: Context[];
  metrics: RetrievalMetricsDto;
  cached: boolean;
}
