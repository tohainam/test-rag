/**
 * Retrieval TCP Controller
 * Handles inter-service communication via TCP microservice
 *
 * Reference: Indexing service pattern (indexing-tcp.controller.ts)
 *
 * TCP Endpoints:
 * 1. query_contexts - Query retrieval contexts (main endpoint)
 * 2. get_retrieval_health - Health check for service discovery
 */

import { Controller, Logger } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { RetrievalWorkflowService } from './workflow/retrieval-workflow.service';
import { QdrantService } from './services/qdrant.service';

/**
 * Query contexts request payload
 */
interface QueryContextsRequest {
  query: string;
  userId: string;
  userEmail: string;
  userRole: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  topK?: number;
  mode?: 'retrieval_only' | 'generation';
}

/**
 * Query contexts response payload
 */
interface QueryContextsResponse {
  success: boolean;
  contexts?: Array<{
    parentChunkId: string;
    documentId: string;
    content: string;
    tokens: number;
    score: number;
    metadata: Record<string, unknown>;
    sources: {
      childChunks: Array<{
        chunkId: string;
        content: string;
        score: number;
      }>;
    };
  }>;
  metrics?: Record<string, unknown>;
  error?: string;
}

/**
 * Health check response payload
 */
interface HealthCheckResponse {
  success: boolean;
  status: 'healthy' | 'degraded';
  message?: string;
  services?: {
    qdrant: boolean;
  };
}

@Controller()
export class RetrievalTcpController {
  private readonly logger = new Logger(RetrievalTcpController.name);

  constructor(
    private readonly workflowService: RetrievalWorkflowService,
    private readonly qdrantService: QdrantService,
  ) {}

  /**
   * TCP endpoint: query_contexts
   * Allows other services to query retrieval contexts directly via TCP
   *
   * Input: { query, userId, userEmail, userRole, topK?, mode? }
   * Output: { success, contexts?, metrics?, error? }
   *
   * Use case: CMS or other services need retrieval without HTTP
   */
  @MessagePattern({ cmd: 'query_contexts' })
  async queryContexts(
    payload: QueryContextsRequest,
  ): Promise<QueryContextsResponse> {
    try {
      this.logger.log(
        `TCP query_contexts request from user ${payload.userId}: "${payload.query}"`,
      );

      // Build user context
      const userContext = {
        userId: payload.userId,
        email: payload.userEmail,
        role: payload.userRole,
      };

      // Build request
      const request = {
        query: payload.query,
        mode: payload.mode || 'retrieval_only',
        topK: payload.topK || 10,
      };

      // Execute workflow
      const result = await this.workflowService.executeWorkflow(
        request,
        userContext,
      );

      this.logger.log(
        `TCP query_contexts completed for user ${payload.userId}: ${result.contexts.length} contexts`,
      );

      return {
        success: true,
        contexts: result.contexts,
        metrics: result.metrics,
      };
    } catch (error: unknown) {
      this.logger.error(
        `TCP query_contexts failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * TCP endpoint: get_retrieval_health
   * Health check for service discovery
   *
   * Input: {} (empty or any)
   * Output: { success, status, message?, services? }
   *
   * Checks:
   * - Qdrant connectivity
   *
   * Status:
   * - healthy: All services connected
   * - degraded: Some services unavailable (can still work with degraded features)
   */
  @MessagePattern({ cmd: 'get_retrieval_health' })
  async getHealth(): Promise<HealthCheckResponse> {
    try {
      this.logger.log('TCP get_retrieval_health request');

      // Check Qdrant health
      let qdrantHealthy = false;
      try {
        qdrantHealthy = await this.qdrantService.healthCheck();
      } catch (error: unknown) {
        this.logger.warn(
          `Qdrant health check failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Determine overall status
      const status = qdrantHealthy ? 'healthy' : 'degraded';

      const response: HealthCheckResponse = {
        success: true,
        status,
        services: {
          qdrant: qdrantHealthy,
        },
      };

      if (!qdrantHealthy) {
        response.message = 'Qdrant service unavailable';
      }

      this.logger.log(`TCP get_retrieval_health: ${status}`);

      return response;
    } catch (error: unknown) {
      this.logger.error(
        `TCP get_retrieval_health failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        success: false,
        status: 'degraded',
        message:
          error instanceof Error
            ? error.message
            : 'Health check failed with unknown error',
      };
    }
  }
}
