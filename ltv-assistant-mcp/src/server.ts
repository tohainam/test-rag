#!/usr/bin/env node

/**
 * LTV Assistant MCP Server
 *
 * A lightweight Model Context Protocol (MCP) server that acts as a proxy
 * to the LTV Assistant API Gateway, enabling VS Code Copilot Chat and other
 * MCP-compatible clients to interact with the retrieval system.
 *
 * Features:
 * - STDIO transport for VS Code Copilot Chat integration
 * - Single tool: retrieve (retrieval_only mode)
 * - Authentication token required
 * - Returns documents based on user role and permissions
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface ServerConfig {
  apiGatewayUrl: string;
  authToken?: string;
}

/**
 * Load configuration from CLI arguments and environment variables
 */
function loadConfig(): ServerConfig {
  const args = process.argv.slice(2);
  let apiGatewayUrl = process.env.API_GATEWAY_URL || 'http://localhost:50050';
  let authToken = process.env.AUTH_TOKEN;

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--api-gateway-url=')) {
      apiGatewayUrl = arg.split('=')[1];
    } else if (arg === '--api-gateway-url' && i + 1 < args.length) {
      apiGatewayUrl = args[++i];
    } else if (arg.startsWith('--auth-token=')) {
      authToken = arg.split('=')[1];
    } else if (arg === '--auth-token' && i + 1 < args.length) {
      authToken = args[++i];
    }
  }

  return {
    apiGatewayUrl: apiGatewayUrl.replace(/\/$/, ''), // Remove trailing slash
    authToken,
  };
}

// ============================================================================
// API GATEWAY CLIENT
// ============================================================================

interface QueryRequest {
  query: string;
  mode: 'retrieval_only' | 'generation';
  topK?: number;
}

interface QueryResponse {
  contexts: Context[];
  metrics: RetrievalMetrics;
  cached: boolean;
}

interface Context {
  parentChunkId: string;
  documentId: string;
  content: string;
  tokens: number;
  score: number;
  metadata: {
    sectionPath?: string[];
    pageNumber?: number;
    documentTitle?: string;
    documentType?: string;
  };
  sources: {
    childChunks: Array<{
      chunkId: string;
      content: string;
      score: number;
    }>;
  };
}

interface RetrievalMetrics {
  totalDuration: number;
  cacheHit: boolean;
  qdrantResultCount: number;
  rerankedResultCount: number;
  parentChunkCount: number;
  iterations: number;
  sufficiencyScore: number;
}

/**
 * Fetch data from API Gateway
 */
async function fetchFromGateway(
  url: string,
  method: string,
  body?: unknown,
  token?: string,
): Promise<unknown> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorJson = JSON.parse(errorText) as { message?: string };
        errorMessage = errorJson.message ?? errorMessage;
      } catch {
        // If response is not JSON, use default error message
      }

      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch from API Gateway: ${error.message}`);
    }
    throw new Error('Failed to fetch from API Gateway: Unknown error');
  }
}

/**
 * Query the retrieval system via API Gateway
 */
async function queryRetrieval(
  query: string,
  topK: number = 10,
  apiGatewayUrl: string,
  authToken?: string,
): Promise<QueryResponse> {
  // Validate inputs
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error(
      'Query parameter is required and must be a non-empty string',
    );
  }

  if (topK < 1 || topK > 50) {
    throw new Error('topK parameter must be between 1 and 50');
  }

  if (!authToken) {
    throw new Error(
      'Authentication token is required. Please provide --auth-token parameter.',
    );
  }

  // Build request body
  const requestBody: QueryRequest = {
    query: query.trim(),
    mode: 'retrieval_only', // Phase 1: only retrieval_only mode supported
    topK,
  };

  // Make request to API Gateway
  const url = `${apiGatewayUrl}/query`;
  const response = await fetchFromGateway(url, 'POST', requestBody, authToken);

  return response as QueryResponse;
}

// ============================================================================
// MCP SERVER SETUP
// ============================================================================

// Tool schemas are now defined inline with registerTool() in main()

/**
 * Main server execution
 */
async function main() {
  // Load configuration
  const config = loadConfig();

  // Log configuration to stderr (not visible to MCP client)
  console.error('LTV Assistant MCP Server starting...');
  console.error(`API Gateway URL: ${config.apiGatewayUrl}`);
  console.error(
    `Authentication: ${config.authToken ? 'Enabled (token provided)' : 'ERROR: No token provided'}`,
  );

  if (!config.authToken) {
    console.error('');
    console.error('ERROR: Authentication token is REQUIRED');
    console.error('Please provide --auth-token=YOUR_PERSONAL_TOKEN');
    console.error('');
    process.exit(1);
  }

  // Create MCP server instance using the high-level API
  const server = new McpServer(
    {
      name: 'ltv-assistant-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {}, // Enable tools capability
      },
    },
  );

  // ============================================================================
  // TOOL REGISTRATION
  // ============================================================================

  /**
   * Register the 'retrieve' tool with comprehensive input schema
   *
   * The output descriptions are embedded in the tool description below since
   * the MCP SDK will automatically return whatever JSON we provide in content.
   */
  server.registerTool(
    'retrieve',
    {
      description:
        'Retrieve relevant document chunks from the LTV Assistant knowledge base using an enriched parent-chunk retrieval strategy. ' +
        'The system first finds relevant child chunks via semantic search, then returns their enriched parent chunks for better context. ' +
        '\n\n' +
        'Returns JSON with the following structure:\n' +
        '- success (boolean): Whether retrieval completed successfully\n' +
        '- query (string): The original search query\n' +
        '- contexts (array): Relevant document chunks with enriched parent content\n' +
        '  - parentChunkId: Unique ID for the parent chunk (larger text segment)\n' +
        '  - documentId: Source document identifier\n' +
        '  - content: Enriched parent chunk text\n' +
        '  - tokens: Token count for budget management\n' +
        '  - score: Relevance score 0-1 (>0.8=highly relevant, 0.6-0.8=moderate, <0.6=tangential)\n' +
        '  - metadata: Document info (sectionPath, pageNumber, documentTitle, documentType)\n' +
        '  - sources.childChunks: Original matched chunks from vector search\n' +
        '- metrics: Performance data\n' +
        '  - totalDuration: Processing time in ms\n' +
        '  - cacheHit: Whether from semantic cache\n' +
        '  - qdrantResultCount: Initial vector DB results\n' +
        '  - rerankedResultCount: After reranking\n' +
        '  - parentChunkCount: Unique parent chunks\n' +
        '  - iterations: Retrieval rounds performed\n' +
        '  - sufficiencyScore: Quality score 0-1 (>0.7=confident results)\n' +
        '- cached (boolean): Whether entire response from cache\n' +
        '- error (string, if success=false): Error details',
      // Input schema using Zod
      inputSchema: {
        query: z
          .string()
          .describe('The search query to find relevant documents'),
        topK: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .default(10)
          .describe('Number of top results to return (default: 10, max: 50)'),
      },
    },
    async (args) => {
      try {
        // Extract and validate arguments
        const query = args.query;
        const topK = args.topK || 10;

        // Execute query
        const result = await queryRetrieval(
          query,
          topK,
          config.apiGatewayUrl,
          config.authToken,
        );

        // Format response for MCP
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  query,
                  contexts: result.contexts,
                  metrics: result.metrics,
                  cached: result.cached,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        // Return error response
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: errorMessage,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ============================================================================
  // TRANSPORT SETUP
  // ============================================================================

  // Create STDIO transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  console.error('LTV Assistant MCP Server ready and listening on STDIO');

  // ============================================================================
  // GRACEFUL SHUTDOWN
  // ============================================================================

  const shutdown = async () => {
    console.error('Shutting down LTV Assistant MCP Server...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

// ============================================================================
// START SERVER
// ============================================================================

main().catch((error) => {
  console.error('Fatal error starting MCP server:', error);
  process.exit(1);
});
