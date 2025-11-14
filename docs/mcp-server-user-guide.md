# LTV Assistant MCP Server - User Guide

This guide walks you through setting up and using the LTV Assistant MCP Server with VS Code Copilot Chat.

## Quick Start (5 Minutes)

### 1. Download the MCP Server

```bash
# Check if API Gateway is running
curl http://localhost:50050/mcp/server/info

# Download the bundle
curl -o ltv-assistant-mcp-server.js http://localhost:50050/mcp/server/download
```

### 2. Get Your Personal Token (Optional but Recommended)

**For authenticated access with full permissions:**

```bash
# If not logged in, login first
curl -X POST http://localhost:50050/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email@example.com", "password": "your-password"}' \
  -c cookies.txt

# Create a personal token
curl -X POST http://localhost:50050/personal-tokens \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name": "VS Code MCP", "expiresInDays": 90}' | jq .token
```

Save the returned token securely.

### 3. Configure VS Code

Create or edit `~/.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "ltv-assistant": {
      "command": "node",
      "args": [
        "/Users/yourname/Downloads/ltv-assistant-mcp-server.js",
        "--api-gateway-url=http://localhost:50050",
        "--auth-token=YOUR_PERSONAL_TOKEN_HERE"
      ]
    }
  }
}
```

**Important**: Replace paths and token with your actual values.

### 4. Restart VS Code

Close and reopen VS Code to load the MCP server configuration.

### 5. Test in Copilot Chat

Open Copilot Chat and try:

```
@agent ltv-assistant retrieve {"query": "What is RAG?"}
```

You should see retrieved contexts from the LTV Assistant knowledge base!

---

## Detailed Setup Guide

### Prerequisites

- **VS Code** with GitHub Copilot Chat extension
- **LTV Assistant** system running (API Gateway on port 50050)
- **Node.js 20+** installed
- **(Optional)** Personal authentication token for full access

### Step 1: Verify API Gateway

Before downloading the MCP server, ensure the API Gateway is running:

```bash
# Check server info
curl http://localhost:50050/mcp/server/info | jq
```

Expected response:
```json
{
  "available": true,
  "filename": "ltv-assistant-mcp-server.js",
  "size": 1234567,
  "sizeFormatted": "1.23 MB",
  "version": "1.0.0",
  "downloadUrl": "/mcp/server/download",
  "usage": { ... }
}
```

### Step 2: Download the Bundle

Download to a permanent location (not your Downloads folder):

```bash
# Create a directory for MCP servers
mkdir -p ~/mcp-servers

# Download the bundle
curl -o ~/mcp-servers/ltv-assistant-mcp-server.js \
  http://localhost:50050/mcp/server/download

# Make it executable (Unix/Mac)
chmod +x ~/mcp-servers/ltv-assistant-mcp-server.js
```

### Step 3: Create Personal Token

#### Why Use a Token?

| Without Token (Public Access) | With Token (Authenticated Access) |
|-------------------------------|----------------------------------|
| Only public documents | Public + your accessible documents |
| Limited knowledge base | Full knowledge base based on permissions |
| Anonymous queries | Tracked usage and permissions |

#### How to Create a Token

**Option A: Using the Auth API**

```bash
# Step 1: Login to get session
curl -X POST http://localhost:50050/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }' \
  -c auth-cookies.txt

# Step 2: Create personal token
curl -X POST http://localhost:50050/personal-tokens \
  -H "Content-Type: application/json" \
  -b auth-cookies.txt \
  -d '{
    "name": "VS Code MCP Server",
    "expiresInDays": 90
  }' | jq -r '.token'

# Save the token output to a secure location
```

**Option B: Using the Admin Panel (if available)**

1. Login to LTV Assistant CMS
2. Navigate to Settings → Personal Tokens
3. Click "Create New Token"
4. Enter name: "VS Code MCP"
5. Set expiration: 90 days
6. Copy the generated token

#### Store Token Securely

```bash
# Store in environment variable (add to ~/.zshrc or ~/.bashrc)
export LTV_ASSISTANT_TOKEN="your_token_here"

# Or use a secure vault like 1Password, LastPass, etc.
```

### Step 4: Configure VS Code MCP

#### Location Options

1. **User-level** (recommended): `~/.vscode/mcp.json`
   - Applies to all VS Code windows
   - Survives project deletions

2. **Project-level**: `<project>/.vscode/mcp.json`
   - Project-specific configuration
   - Can be shared with team (without token!)

#### Configuration Format

Create `~/.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "ltv-assistant": {
      "command": "node",
      "args": [
        "/Users/yourname/mcp-servers/ltv-assistant-mcp-server.js",
        "--api-gateway-url=http://localhost:50050",
        "--auth-token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      ]
    }
  }
}
```

#### Using Environment Variables (Recommended)

Instead of hardcoding the token:

```json
{
  "mcpServers": {
    "ltv-assistant": {
      "command": "node",
      "args": [
        "/Users/yourname/mcp-servers/ltv-assistant-mcp-server.js",
        "--api-gateway-url=http://localhost:50050"
      ],
      "env": {
        "AUTH_TOKEN": "${env:LTV_ASSISTANT_TOKEN}"
      }
    }
  }
}
```

Then set `LTV_ASSISTANT_TOKEN` in your shell environment.

### Step 5: Restart VS Code

**Important**: VS Code only loads MCP configurations on startup.

```bash
# Close all VS Code windows
# Reopen VS Code
code .
```

### Step 6: Verify MCP Server

Check VS Code Output panel:
1. Open Output panel (View → Output)
2. Select "GitHub Copilot Chat" from dropdown
3. Look for: `ltv-assistant MCP server connected`

### Step 7: Test the Integration

Open Copilot Chat (click chat icon in sidebar or `Cmd+Shift+I` / `Ctrl+Shift+I`).

#### Basic Test

```
@agent ltv-assistant query_retrieval {"query": "test"}
```

Expected response: JSON with contexts, metrics, and cached flag.

#### Practical Examples

```
# Query about specific topic
@agent ltv-assistant retrieve {
  "query": "How does semantic caching work?",
  "topK": 5
}

# Technical documentation search
@agent ltv-assistant retrieve {
  "query": "API Gateway authentication flow"
}

# Code examples
@agent ltv-assistant query_retrieval {
  "query": "NestJS microservices TCP communication examples",
  "topK": 10
}
```

---

## Usage Patterns

### In Copilot Chat

The MCP server integrates with Copilot's agent mode:

**Pattern 1: Direct Tool Call**
```
@agent ltv-assistant query_retrieval {"query": "your question"}
```

**Pattern 2: Natural Language (if Copilot auto-detects)**
```
@ltv-assistant search for information about RAG systems
```

**Pattern 3: Multi-step Workflow**
```
Use @ltv-assistant to find documents about authentication,
then help me implement OAuth2 based on those docs
```

### Response Format

```json
{
  "success": true,
  "query": "How does semantic caching work?",
  "contexts": [
    {
      "parentChunkId": "chunk_123",
      "documentId": "doc_456",
      "content": "Semantic caching stores query embeddings...",
      "score": 0.95,
      "metadata": {
        "documentTitle": "Caching Design",
        "documentType": "public"
      },
      "sources": {
        "childChunks": [...]
      }
    }
  ],
  "metrics": {
    "totalDuration": 1234,
    "cacheHit": false,
    "parentChunkCount": 10
  },
  "cached": false
}
```

---

## Troubleshooting

### MCP Server Not Detected

**Symptom**: `ltv-assistant` doesn't appear in `@agent` suggestions

**Solutions**:
1. Check `mcp.json` syntax (use JSON validator)
2. Verify file path is absolute, not relative
3. Ensure Node.js is in PATH
4. Restart VS Code completely
5. Check VS Code Output panel for errors

### Authentication Errors

**Symptom**: Error messages about invalid token

**Solutions**:
1. Verify token hasn't expired
2. Check token format (should start with `eyJ...`)
3. Regenerate token via `/personal-tokens` endpoint
4. Remove `--auth-token` to test public access

### Connection Errors

**Symptom**: "Failed to fetch from API Gateway"

**Solutions**:
1. Check API Gateway is running: `curl http://localhost:50050/health`
2. Verify URL in configuration (no trailing slash)
3. Check firewall/network settings
4. Review API Gateway logs

### No Results Returned

**Symptom**: Empty contexts array

**Solutions**:
1. Check if documents are indexed
2. Try broader query terms
3. Verify you have access to documents (check with token)
4. Test without token to confirm public documents exist

### Slow Response Times

**Symptom**: Queries take > 5 seconds

**Solutions**:
1. Check API Gateway and services are healthy
2. Reduce `topK` parameter (fewer results = faster)
3. Check network latency
4. Review retrieval service logs for bottlenecks

---

## Advanced Configuration

### Multiple API Gateways

Configure different environments:

```json
{
  "mcpServers": {
    "ltv-dev": {
      "command": "node",
      "args": [
        "/path/to/ltv-assistant-mcp-server.js",
        "--api-gateway-url=http://localhost:50050",
        "--auth-token=${env:LTV_DEV_TOKEN}"
      ]
    },
    "ltv-prod": {
      "command": "node",
      "args": [
        "/path/to/ltv-assistant-mcp-server.js",
        "--api-gateway-url=https://prod.example.com",
        "--auth-token=${env:LTV_PROD_TOKEN}"
      ]
    }
  }
}
```

### Project-Specific Configuration

Share configuration with your team (without exposing tokens):

`.vscode/mcp.json`:
```json
{
  "mcpServers": {
    "ltv-assistant": {
      "command": "node",
      "args": [
        "${workspaceFolder}/../mcp-servers/ltv-assistant-mcp-server.js",
        "--api-gateway-url=${env:LTV_API_URL}",
        "--auth-token=${env:LTV_TOKEN}"
      ]
    }
  }
}
```

`.env.example`:
```bash
# Copy to .env and fill in your values
LTV_API_URL=http://localhost:50050
LTV_TOKEN=your_personal_token_here
```

---

## Security Best Practices

### Token Management

1. **Never commit tokens to git**
   - Add `mcp.json` to `.gitignore` if it contains tokens
   - Use environment variables instead

2. **Set appropriate expiration**
   - Development: 30-90 days
   - Production: 7-30 days
   - Automated systems: Implement rotation

3. **Revoke unused tokens**
   ```bash
   # List your tokens
   curl http://localhost:50050/personal-tokens \
     -H "Authorization: Bearer $TOKEN"

   # Revoke a token
   curl -X DELETE http://localhost:50050/personal-tokens/{tokenId} \
     -H "Authorization: Bearer $TOKEN"
   ```

### Access Control

1. **Principle of least privilege**
   - Only request access to documents you need
   - Regularly audit your document whitelist

2. **Separate tokens for different purposes**
   - VS Code MCP: One token
   - CLI tools: Different token
   - Automated scripts: Separate token

### Network Security

1. **Use HTTPS in production**
   ```json
   "args": [
     "/path/to/server.js",
     "--api-gateway-url=https://api.example.com"
   ]
   ```

2. **Validate certificates**
   - Ensure SSL/TLS is properly configured
   - Don't disable certificate validation

---

## FAQ

**Q: Can I use the MCP server without VS Code?**
A: Yes! The MCP server uses STDIO protocol and can work with any MCP-compatible client (Claude Desktop, other tools).

**Q: Does the MCP server store my queries?**
A: No. The server is stateless and only proxies requests to the API Gateway. Query logging happens server-side.

**Q: Can I use multiple MCP servers simultaneously?**
A: Yes! Configure multiple servers in `mcp.json` with different names.

**Q: How do I update the MCP server?**
A: Download the latest bundle from `/mcp/server/download` and replace your existing file. Restart VS Code.

**Q: What happens if API Gateway is down?**
A: The MCP server will return connection errors. Your VS Code won't crash, but queries will fail.

**Q: Can I customize the query parameters?**
A: Yes! Use the `topK` parameter in your queries. Future versions will support more parameters.

---

## Support & Resources

- **Documentation**: See main LTV Assistant docs
- **API Reference**: `/docs/api/` in project
- **Issues**: Contact development team
- **Updates**: Check `/mcp/server/info` for latest version

---

## Next Steps

- Explore advanced query patterns
- Create custom workflows combining MCP with Copilot
- Integrate with your development workflow
- Provide feedback to improve the system
