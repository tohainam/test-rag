/**
 * Admin Controller
 * Handles administrative operations for the retrieval service
 *
 * Security:
 * - Only SUPER_ADMIN role can access these endpoints
 * - Protected by GatewayAuthGuard (requires API Gateway authentication)
 */

import {
  Controller,
  Post,
  UseGuards,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { GatewayAuthGuard } from '../common/guards/gateway-auth.guard';
import {
  CurrentUser,
  type CurrentUserData,
} from '../common/decorators/current-user.decorator';
import { CacheInvalidationService } from './services/cache-invalidation.service';

/**
 * Cache cleanup response
 */
interface CacheCleanupResponse {
  success: boolean;
  message: string;
}

@Controller('admin')
@UseGuards(GatewayAuthGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly cacheInvalidationService: CacheInvalidationService,
  ) {}

  /**
   * POST /admin/cache/cleanup
   * Manually trigger cache cleanup (SUPER_ADMIN only)
   *
   * Use cases:
   * - Force cleanup of expired cache entries
   * - Maintenance operations
   * - Testing cache behavior
   *
   * Response:
   * {
   *   "success": true,
   *   "message": "Manual cache cleanup completed successfully"
   * }
   */
  @Post('cache/cleanup')
  async manualCacheCleanup(
    @CurrentUser() user: CurrentUserData,
  ): Promise<CacheCleanupResponse> {
    // Only SUPER_ADMIN can perform this operation
    if (user.role !== 'SUPER_ADMIN') {
      this.logger.warn(
        `Unauthorized cache cleanup attempt by user ${user.userId} (${user.role})`,
      );
      throw new ForbiddenException(
        'Only SUPER_ADMIN can perform cache cleanup',
      );
    }

    this.logger.log(
      `Manual cache cleanup requested by SUPER_ADMIN ${user.userId}`,
    );

    const result = await this.cacheInvalidationService.manualCleanup();

    this.logger.log(
      `Manual cache cleanup completed: ${result.success ? 'success' : 'failed'}`,
    );

    return result;
  }
}
