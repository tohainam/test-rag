/**
 * Retrieval HTTP Controller
 * Handles retrieval requests via HTTP (proxied through API Gateway)
 *
 * Architecture:
 * - API Gateway proxies /query/** to this service on port 50053
 * - Gateway handles JWT authentication via Auth service TCP
 * - Gateway injects user context in headers
 * - GatewayAuthGuard verifies requests come from gateway
 *
 * Reference: PRD Section "POST /query" (Lines 2657-2709)
 */

import {
  Controller,
  Post,
  Body,
  UseGuards,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { GatewayAuthGuard } from '../common/guards/gateway-auth.guard';
import {
  CurrentUser,
  type CurrentUserData,
} from '../common/decorators/current-user.decorator';
import { QueryRequestDto } from './dto/query-request.dto';
import type { RetrievalResultDto } from './dto/retrieval-result.dto';
import { RetrievalWorkflowService } from './workflow/retrieval-workflow.service';

@Controller('query')
@UseGuards(GatewayAuthGuard)
export class RetrievalController {
  private readonly logger = new Logger(RetrievalController.name);

  constructor(private readonly workflowService: RetrievalWorkflowService) {}

  /**
   * POST /query
   * Main retrieval endpoint (accessed via API Gateway at /query)
   *
   * Request:
   * {
   *   "query": "What is the purpose of this document?",
   *   "mode": "retrieval_only" | "generation",  // optional, default: retrieval_only
   *   "topK": 10  // optional, default: 10
   * }
   *
   * Response:
   * {
   *   "contexts": [...],
   *   "metrics": { totalDuration, cacheHit, ... },
   *   "cached": false
   * }
   */
  @Post()
  async query(
    @Body(ValidationPipe) body: QueryRequestDto,
    @CurrentUser() user: CurrentUserData,
  ): Promise<RetrievalResultDto> {
    this.logger.log(
      `Query request from user ${user.userId} (${user.role}): "${body.query}"`,
    );

    // Build user context for workflow
    const userContext = {
      userId: user.userId,
      email: user.email,
      role: user.role as 'SUPER_ADMIN' | 'ADMIN' | 'USER',
    };

    // Execute retrieval workflow
    const result = await this.workflowService.executeWorkflow(
      body,
      userContext,
    );

    this.logger.log(
      `Query completed for user ${user.userId}: ${result.contexts.length} contexts, ${result.metrics.totalDuration}ms`,
    );

    return result;
  }
}
