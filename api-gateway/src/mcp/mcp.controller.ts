import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Res,
  StreamableFile,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, existsSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * MCP Download Controller
 *
 * Provides endpoints for downloading and getting information about the
 * LTV Assistant MCP Server bundle.
 *
 * NOTE: These endpoints are PUBLIC (no authentication required) as specified
 * in the implementation requirements. Users download the bundle and configure
 * it with their personal authentication tokens locally.
 */
@Controller('mcp')
export class McpController {
  private readonly bundlePath: string;

  constructor() {
    // Path to the bundled MCP server file
    this.bundlePath = join(
      process.cwd(),
      'public',
      'ltv-assistant-mcp-server.js',
    );
  }

  /**
   * Download the MCP server bundle
   *
   * PUBLIC ENDPOINT - No authentication required
   *
   * Returns the bundled MCP server as a downloadable JavaScript file.
   * Users can then run this file with their personal authentication token.
   *
   * @returns StreamableFile - The MCP server bundle
   */
  @Get('server/download')
  @Header('Content-Type', 'application/javascript')
  @Header('Cache-Control', 'no-cache')
  downloadServer(@Res({ passthrough: true }) res: Response): StreamableFile {
    try {
      // Check if bundle exists
      if (!existsSync(this.bundlePath)) {
        throw new NotFoundException(
          'MCP server bundle not found. Please contact the administrator.',
        );
      }

      // Get file stats
      const stats = statSync(this.bundlePath);

      // Set response headers
      res.set({
        'Content-Disposition':
          'attachment; filename="ltv-assistant-mcp-server.js"',
        'Content-Length': stats.size.toString(),
      });

      // Stream file to response
      const fileStream = createReadStream(this.bundlePath);

      return new StreamableFile(fileStream);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to download MCP server bundle',
      );
    }
  }

  /**
   * Get information about the MCP server bundle
   *
   * PUBLIC ENDPOINT - No authentication required
   *
   * Returns metadata about the MCP server bundle including:
   * - Availability status
   * - File size and last modified date
   * - Version information
   * - Usage instructions
   *
   * @returns Object with bundle information and usage instructions
   */
  @Get('server/info')
  getServerInfo(): {
    available: boolean;
    filename?: string;
    size?: number;
    sizeFormatted?: string;
    lastModified?: string;
    version?: string;
    downloadUrl?: string;
    usage?: {
      command: string;
      description: string;
      examples: {
        withToken: string;
        withoutToken: string;
        withEnvVars: string;
      };
      vsCodeConfig: {
        location: string;
        example: Record<string, unknown>;
      };
      tokenGeneration: {
        endpoint: string;
        description: string;
      };
    };
  } {
    try {
      // Check if bundle exists
      if (!existsSync(this.bundlePath)) {
        return {
          available: false,
        };
      }

      // Get file stats
      const stats = statSync(this.bundlePath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      // Try to extract version from package.json in ltv-assistant-mcp
      let version = '1.0.0';
      try {
        const packageJsonPath = join(
          process.cwd(),
          '..',
          'ltv-assistant-mcp',
          'package.json',
        );
        if (existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(
            readFileSync(packageJsonPath, 'utf-8'),
          ) as { version?: string };
          version = packageJson.version ?? version;
        }
      } catch {
        // Use default version if package.json cannot be read
      }

      // Determine API Gateway URL
      const apiGatewayUrl =
        process.env.API_GATEWAY_URL || 'http://localhost:50050';

      return {
        available: true,
        filename: 'ltv-assistant-mcp-server.js',
        size: stats.size,
        sizeFormatted: `${sizeMB} MB`,
        lastModified: stats.mtime.toISOString(),
        version,
        downloadUrl: '/mcp/server/download',
        usage: {
          command: 'node ltv-assistant-mcp-server.js',
          description:
            'Run the MCP server with optional authentication token and API Gateway URL',
          examples: {
            withToken: `node ltv-assistant-mcp-server.js --api-gateway-url=${apiGatewayUrl} --auth-token=YOUR_PERSONAL_TOKEN`,
            withoutToken: `node ltv-assistant-mcp-server.js --api-gateway-url=${apiGatewayUrl}`,
            withEnvVars:
              'API_GATEWAY_URL=http://localhost:50050 AUTH_TOKEN=YOUR_PERSONAL_TOKEN node ltv-assistant-mcp-server.js',
          },
          vsCodeConfig: {
            location: '~/.vscode/mcp.json or project .vscode/mcp.json',
            example: {
              mcpServers: {
                'ltv-assistant': {
                  command: 'node',
                  args: [
                    '/path/to/ltv-assistant-mcp-server.js',
                    '--api-gateway-url=http://localhost:50050',
                    '--auth-token=YOUR_PERSONAL_TOKEN',
                  ],
                },
              },
            },
          },
          tokenGeneration: {
            endpoint: '/personal-tokens',
            description:
              'Create a personal authentication token via POST /personal-tokens endpoint. ' +
              'This token will be used to authenticate your MCP server requests. ' +
              'Without a token, only public documents are accessible.',
          },
        },
      };
    } catch {
      throw new InternalServerErrorException(
        'Failed to retrieve MCP server information',
      );
    }
  }
}
