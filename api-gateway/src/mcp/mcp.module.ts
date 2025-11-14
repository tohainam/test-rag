import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller.js';

/**
 * MCP Module
 *
 * Provides endpoints for downloading and managing the LTV Assistant MCP Server.
 * This module enables VS Code Copilot Chat and other MCP-compatible clients
 * to integrate with the LTV Assistant retrieval system.
 */
@Module({
  controllers: [McpController],
})
export class McpModule {}
