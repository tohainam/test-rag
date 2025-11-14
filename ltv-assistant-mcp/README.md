# LTV Assistant MCP Server

A lightweight Model Context Protocol (MCP) server that enables VS Code Copilot Chat and other MCP-compatible clients to interact with the LTV Assistant retrieval system.

## Overview

The LTV Assistant MCP Server acts as a proxy client to the LTV Assistant API Gateway, providing seamless integration with VS Code Copilot Chat's agent mode. It allows developers to query the LTV Assistant knowledge base directly from their IDE.

### Features

- **Single-file bundle**: Self-contained executable with all dependencies included
- **STDIO transport**: Standard input/output for VS Code Copilot Chat integration
- **Optional authentication**: Public access without token, full access with personal token
- **Retrieval-only mode**: Phase 1 focuses on document retrieval (generation mode planned for future)
- **Lightweight**: No complex dependencies, pure Node.js + TypeScript

### Architecture

```
VS Code Copilot Chat (Agent Mode)
    ↓ STDIO
MCP Server (Single File Bundle)
    ↓ HTTP/REST
API Gateway (/query endpoint)
    ↓
Retrieval Service
    ↓
[Qdrant, MySQL]
```

## Installation

### Download from API Gateway

The MCP server bundle can be downloaded directly from the API Gateway:

```bash
# Get server information
curl http://localhost:50050/mcp/server/info

# Download the bundle
curl -O http://localhost:50050/mcp/server/download
```

The downloaded file `ltv-assistant-mcp-server.js` is a self-contained executable.

### Build from Source

Alternatively, build the MCP server from source:

```bash
# Install dependencies
cd ltv-assistant-mcp
npm install

# Build TypeScript
npm run build

# Create bundle and copy to API Gateway
npm run build:bundle
```

## Configuration

The MCP server can be configured via CLI arguments or environment variables:

### CLI Arguments

- `--api-gateway-url <URL>`: API Gateway URL (default: `http://localhost:50050`)
- `--auth-token <TOKEN>`: Personal authentication token (optional)

### Environment Variables

- `API_GATEWAY_URL`: API Gateway URL
- `AUTH_TOKEN`: Personal authentication token

### Examples

```bash
# Run with authentication
node ltv-assistant-mcp-server.js \
  --api-gateway-url=http://localhost:50050 \
  --auth-token=YOUR_PERSONAL_TOKEN

# Run without authentication (public access only)
node ltv-assistant-mcp-server.js \
  --api-gateway-url=http://localhost:50050

# Using environment variables
API_GATEWAY_URL=http://localhost:50050 \
AUTH_TOKEN=YOUR_PERSONAL_TOKEN \
node ltv-assistant-mcp-server.js
```

## VS Code Copilot Chat Integration

### Prerequisites

- VS Code with GitHub Copilot Chat extension
- LTV Assistant API Gateway running

### Setup Steps

1. **Download the MCP server bundle** (see Installation section above)

2. **Create or edit MCP configuration file**:
   - User-level: `~/.vscode/mcp.json`
   - Project-level: `.vscode/mcp.json` in your project

3. **Add MCP server configuration**:

```json
{
  "mcpServers": {
    "ltv-assistant": {
      "command": "node",
      "args": [
        "/path/to/ltv-assistant-mcp-server.js",
        "--api-gateway-url=http://localhost:50050",
        "--auth-token=YOUR_PERSONAL_TOKEN"
      ]
    }
  }
}
```

4. **Restart VS Code** to load the new MCP server

5. **Test in Copilot Chat**:
   - Open Copilot Chat
   - Type: `@agent ltv-assistant retrieve {"query": "test"}`
   - You should see retrieved contexts from the LTV Assistant system

### Troubleshooting VS Code Integration

- **Server not detected**: Check MCP configuration path and syntax
- **Authentication errors**: Verify your personal token is valid
- **Connection errors**: Ensure API Gateway is running and accessible
- **No results**: Check if documents are indexed and accessible

## Authentication & Permissions

### Getting a Personal Token

Create a personal authentication token via the API Gateway:

```bash
# Login first (if using session-based auth)
curl -X POST http://localhost:50050/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'

# Create personal token
curl -X POST http://localhost:50050/personal-tokens \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=YOUR_SESSION_TOKEN" \
  -d '{"name": "MCP Server Token", "expiresInDays": 90}'
```

### Public vs Authenticated Access

**Without Authentication Token:**
- Only public documents are returned
- Limited to publicly available knowledge base

**With Authentication Token:**
- Public documents + documents you have access to
- Permissions based on your user role and document whitelist
- Full access for SUPER_ADMIN users

## Available Tools

### retrieve

Retrieve relevant document chunks from the LTV Assistant knowledge base.

**Input Schema:**

```typescript
{
  query: string;           // REQUIRED: The search query
  topK?: number;          // OPTIONAL: Number of results (1-50, default: 10)
}
```

**Output:**

```typescript
{
  success: boolean;
  query: string;
  contexts: Context[];     // Retrieved context chunks
  metrics: {
    totalDuration: number;
    cacheHit: boolean;
    qdrantResultCount: number;
    rerankedResultCount: number;
    parentChunkCount: number;
    iterations: number;
    sufficiencyScore: number;
  };
  cached: boolean;         // True if result from semantic cache
}
```

**Context Object:**

```typescript
{
  parentChunkId: string;
  documentId: string;
  content: string;         // Parent chunk content (enriched)
  tokens: number;
  score: number;
  metadata: {
    sectionPath?: string[];
    pageNumber?: number;
    documentTitle?: string;
    documentType?: string;
  };
  sources: {
    childChunks: Array<{   // Original matching child chunks
      chunkId: string;
      content: string;
      score: number;
    }>;
  };
}
```

## Development

### Project Structure

```
ltv-assistant-mcp/
├── src/
│   └── server.ts              # Main MCP server implementation
├── scripts/
│   ├── bundle.js              # esbuild bundling script
│   └── copy-bundle.js         # Copy to API Gateway
├── dist/                      # Compiled output
│   ├── server.js              # TypeScript output
│   └── mcp-server-bundle.js   # Bundled single file
├── package.json
├── tsconfig.json
└── README.md
```

### Build Scripts

```bash
# Development with watch mode
npm run start:dev

# TypeScript compilation
npm run build

# Create bundle and copy to API Gateway
npm run build:bundle

# Format code
npm run format

# Lint code
npm run lint

# Format, lint, and build
npm run check
```

### Testing

```bash
# Test the MCP server standalone
node dist/server.js \
  --api-gateway-url=http://localhost:50050 \
  --auth-token=YOUR_TOKEN

# Test query via stdin/stdout (simulating MCP protocol)
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/server.js
```

## Security Best Practices

1. **Token Management**:
   - Store tokens securely (use environment variables or secure vaults)
   - Never commit tokens to version control
   - Set appropriate expiration periods (e.g., 90 days)

2. **Access Control**:
   - Use least-privilege principle (request only necessary permissions)
   - Regularly rotate personal tokens
   - Revoke unused tokens

3. **Network Security**:
   - Use HTTPS in production environments
   - Ensure API Gateway is behind proper authentication
   - Validate SSL certificates

## Limitations (Phase 1)

- **Retrieval only**: Generation mode not yet implemented
- **Single tool**: Only `retrieve` tool available
- **No resources**: Resource discovery not yet supported
- **No prompts**: Prompt templates not yet supported

## Future Enhancements

- **Additional tools**: `list_documents`, `get_document`, `search_documents`
- **Generation mode**: RAG-based answer generation
- **Resource discovery**: Browse available documents and files
- **Prompt templates**: Pre-configured query templates
- **Streaming responses**: Real-time result streaming
- **Caching layer**: Client-side caching for performance

## Troubleshooting

### Common Issues

**Error: "Failed to fetch from API Gateway"**
- Check if API Gateway is running
- Verify the URL is correct
- Ensure no firewall blocking the connection

**Error: "Invalid authentication token"**
- Verify token is not expired
- Check token format (should be JWT string)
- Regenerate token if needed

**Error: "No authentication token provided"** (from API Gateway)
- This is expected for public access
- Add `--auth-token` if you want authenticated access

**No results returned**
- Check if documents are indexed in the system
- Verify document permissions (public vs private)
- Try a different query

### Debug Mode

Enable verbose logging by checking stderr output:

```bash
node ltv-assistant-mcp-server.js \
  --api-gateway-url=http://localhost:50050 \
  --auth-token=YOUR_TOKEN \
  2>&1 | tee mcp-debug.log
```

## Support

For issues, questions, or contributions:
- Check the main LTV Assistant documentation
- Review API Gateway logs for request details
- Contact the development team

## License

UNLICENSED - Private project
