# Cloudflare MCP Servers Setup

Cloudflare provides 15+ managed, hosted MCP servers that give Claude direct access to your Cloudflare services.

## Available Servers

### Core Services

1. **Documentation Server**
   - URL: `https://documentation.mcp.cloudflare.com/mcp`
   - Access Cloudflare product documentation and reference materials

2. **Workers Bindings Server**
   - URL: `https://workers-bindings.mcp.cloudflare.com/mcp`
   - Build and deploy Workers, manage KV, R2, D1, AI bindings

3. **Observability Server**
   - URL: `https://observability.mcp.cloudflare.com/mcp`
   - View logs, traces, and analytics for Workers and other services

### DNS & Network

4. **DNS Server**
   - URL: `https://dns.mcp.cloudflare.com/mcp`
   - Manage DNS records programmatically

5. **DNS Analytics Server**
   - URL: `https://dns-analytics.mcp.cloudflare.com/mcp`
   - Optimize DNS performance with query analytics

### Security

6. **Audit Logs Server**
   - URL: `https://audit-logs.mcp.cloudflare.com/mcp`
   - Query and generate security audit reports

7. **CASB Server**
   - URL: `https://casb.mcp.cloudflare.com/mcp`
   - Cloud Access Security Broker analytics

### AI & ML

8. **AI Gateway Server**
   - URL: `https://ai-gateway.mcp.cloudflare.com/mcp`
   - Search logs, analyze prompts and responses

9. **AutoRAG Server**
   - URL: `https://autorag.mcp.cloudflare.com/mcp`
   - Automatic Retrieval-Augmented Generation

### Developer Tools

10. **Browser Rendering Server**
    - URL: `https://browser-rendering.mcp.cloudflare.com/mcp`
    - Take screenshots, fetch web pages

11. **Container Server**
    - URL: `https://container.mcp.cloudflare.com/mcp`
    - Manage sandbox development environments

12. **GraphQL Server**
    - URL: `https://graphql.mcp.cloudflare.com/mcp`
    - Query Cloudflare analytics via GraphQL

### Traffic & Intelligence

13. **Radar Server**
    - URL: `https://radar.mcp.cloudflare.com/mcp`
    - Internet traffic insights, URL scanning

## Prerequisites

1. A Cloudflare account (free or paid)
2. An API token with appropriate permissions

## Setup Steps

### Step 1: Create API Token

1. Log into Cloudflare Dashboard: https://dash.cloudflare.com/
2. Go to "My Profile" → "API Tokens"
3. Click "Create Token"
4. Choose "Custom token" or use a template
5. Set permissions based on which MCP servers you want to use:

   **For Workers/Observability:**
   - Account → Workers Scripts → Read/Edit
   - Account → Workers KV Storage → Read/Edit
   - Account → Workers Tail → Read

   **For DNS:**
   - Zone → DNS → Read/Edit

   **For AI Gateway:**
   - Account → AI Gateway → Read

   **For Audit Logs:**
   - Account → Audit Logs → Read

   **Recommended:** Create a token with "All account" and "All zone" permissions for full access

6. Click "Continue to summary" → "Create Token"
7. **Copy and save your token** (starts with `cf_...`)

### Step 2: Get Account ID

1. In Cloudflare Dashboard, select your account
2. Go to "Workers & Pages" or any account-level page
3. Your Account ID is shown in the right sidebar or URL
4. Format: `1234567890abcdef1234567890abcdef`

### Step 3: Configure Claude

#### For Clients Without Native Remote MCP Support (like Claude Code CLI)

You need to use the `mcp-remote` proxy package.

Add to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "cloudflare-observability": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://observability.mcp.cloudflare.com/mcp"
      ],
      "env": {
        "CLOUDFLARE_API_TOKEN": "cf_your_token_here",
        "CLOUDFLARE_ACCOUNT_ID": "your_account_id_here"
      }
    },
    "cloudflare-workers": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://workers-bindings.mcp.cloudflare.com/mcp"
      ],
      "env": {
        "CLOUDFLARE_API_TOKEN": "cf_your_token_here",
        "CLOUDFLARE_ACCOUNT_ID": "your_account_id_here"
      }
    },
    "cloudflare-dns": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://dns.mcp.cloudflare.com/mcp"
      ],
      "env": {
        "CLOUDFLARE_API_TOKEN": "cf_your_token_here"
      }
    },
    "cloudflare-ai-gateway": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://ai-gateway.mcp.cloudflare.com/mcp"
      ],
      "env": {
        "CLOUDFLARE_API_TOKEN": "cf_your_token_here",
        "CLOUDFLARE_ACCOUNT_ID": "your_account_id_here"
      }
    }
  }
}
```

#### For Clients With Native Remote MCP Support

If using a client that supports remote MCP servers natively (like Cloudflare AI Playground), you can directly input the server URL in the client's interface.

### Step 4: Environment Variables (Alternative)

Instead of hardcoding tokens in `settings.json`, you can use environment variables:

Create `~/.cloudflare-mcp.env`:

```bash
export CLOUDFLARE_API_TOKEN="cf_your_token_here"
export CLOUDFLARE_ACCOUNT_ID="your_account_id_here"
```

Source before starting Claude:

```bash
source ~/.cloudflare-mcp.env
claude-code
```

Or add to your `~/.bashrc` or `~/.zshrc`.

## Usage Examples

Once configured, you can ask Claude to:

### Workers Management
- "List all my Workers scripts"
- "Show me the code for the worker named 'api-handler'"
- "Deploy this worker to production"

### Observability
- "Show me the logs for my worker in the last hour"
- "What errors occurred in my API worker today?"
- "Analyze the performance of my authentication worker"

### DNS Management
- "List all DNS records for example.com"
- "Add an A record pointing www.example.com to 192.0.2.1"
- "Show me DNS analytics for the past week"

### AI Gateway
- "Show me all AI Gateway logs from today"
- "What are the most common prompts sent to my AI gateway?"
- "Analyze the cost and performance of my AI API calls"

## Security Best Practices

1. **Token Scoping**: Create separate tokens for different MCP servers with minimal required permissions
2. **Token Rotation**: Regularly rotate your API tokens
3. **Environment Variables**: Never commit tokens to git; use environment variables
4. **Audit Logs**: Enable and monitor the Audit Logs MCP server to track all API activity
5. **OAuth (Advanced)**: For production deployments, consider implementing OAuth authentication

## Troubleshooting

### "Authentication failed"
- Verify your API token is correct and not expired
- Check token permissions match the server you're accessing
- Ensure Account ID is correct for account-level servers

### "Module not found: mcp-remote"
- Run: `npm install -g mcp-remote`
- Or let npx install it automatically on first use

### Context Limits
- Complex queries may hit Claude's context window
- Break large requests into smaller, focused queries
- Use specific date ranges for log queries

## Advanced: Building Custom MCP Servers on Cloudflare

You can also build your own MCP servers and deploy them to Cloudflare Workers.

```bash
# Create a new MCP server
npm create cloudflare@latest -- my-mcp-server --template=cloudflare/ai/demos/remote-mcp-github-oauth

# Deploy to Cloudflare
npm run deploy
```

Your custom server will be available at:
`https://my-mcp-server.your-account.workers.dev/sse`

See: https://developers.cloudflare.com/agents/guides/remote-mcp-server/

## Additional Resources

- Cloudflare MCP GitHub: https://github.com/cloudflare/mcp-server-cloudflare
- MCP Documentation: https://modelcontextprotocol.io/
- Cloudflare Agents Docs: https://developers.cloudflare.com/agents/
