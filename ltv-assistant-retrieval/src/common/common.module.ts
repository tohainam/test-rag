/**
 * Common Module
 * Provides shared guards, decorators, and utilities
 */

import { Module, Global } from '@nestjs/common';
import { GatewayAuthGuard } from './guards/gateway-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  providers: [GatewayAuthGuard, RolesGuard],
  exports: [GatewayAuthGuard, RolesGuard],
})
export class CommonModule {}
