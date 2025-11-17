# Slack MCP Server Setup

## Option 1: Official Server (Archived but Stable)

The official `@modelcontextprotocol/server-slack` package is now archived but still functional.

### Prerequisites

1. A Slack workspace where you have admin access
2. A Slack Bot token with appropriate permissions

### Get Your Slack Credentials

#### Step 1: Create a Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App"
3. Choose "From scratch"
4. Name your app (e.g., "Claude MCP Bot")
5. Select your workspace

#### Step 2: Configure Bot Permissions

1. Navigate to "OAuth & Permissions" in the sidebar
2. Scroll to "Scopes" → "Bot Token Scopes"
3. Add these scopes:
   - `channels:history` - View messages in public channels
   - `channels:read` - View basic channel info
   - `chat:write` - Send messages
   - `groups:history` - View messages in private channels
   - `groups:read` - View basic private channel info
   - `im:history` - View messages in DMs
   - `im:read` - View basic DM info
   - `mpim:history` - View messages in group DMs
   - `mpim:read` - View basic group DM info
   - `users:read` - View users in workspace
   - `reactions:write` - Add emoji reactions

#### Step 3: Install App to Workspace

1. Scroll to top of "OAuth & Permissions" page
2. Click "Install to Workspace"
3. Review permissions and click "Allow"
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

#### Step 4: Get Team ID

1. Open Slack in browser
2. Click on workspace name in top-left
3. Select "Settings & administration" → "Workspace settings"
4. Team ID is in the URL: `https://[workspace].slack.com/admin/settings#team_id=T01234567`

#### Step 5: Get Channel IDs (Optional)

To limit access to specific channels:
1. Right-click on a channel name
2. Select "View channel details"
3. Scroll to bottom - Channel ID is shown (starts with `C`)

### Configuration

Add to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-bot-token",
        "SLACK_TEAM_ID": "T01234567",
        "SLACK_CHANNEL_IDS": "C01234567,C76543210"
      }
    }
  }
}
```

**Environment Variables:**
- `SLACK_BOT_TOKEN` (required): Your bot token from Step 3
- `SLACK_TEAM_ID` (required): Your team ID from Step 4
- `SLACK_CHANNEL_IDS` (optional): Comma-separated channel IDs to limit access

### Restart Claude

After saving the configuration, restart Claude Code for changes to take effect.

## Option 2: Community Server (Actively Maintained)

The `korotovsky/slack-mcp-server` is more feature-rich and actively maintained.

### Key Advantages

- No app creation required (uses browser tokens)
- Supports Slack Apps integration
- Multiple transport options (stdio, SSE)
- Advanced caching and performance
- Better DM and Group DM support

### Authentication Options

You can authenticate using either:
- **User OAuth token** (`xoxp-...`) - Traditional method
- **Browser tokens** (`xoxc-...` + `xoxd-...`) - "Stealth mode", no app needed

### Get Browser Tokens (Easiest Method)

1. Open Slack in your browser
2. Open Developer Tools (F12)
3. Go to Application/Storage → Cookies
4. Find your workspace domain
5. Copy these cookie values:
   - `xoxc-...` → `SLACK_MCP_XOXC_TOKEN`
   - `d` cookie → `SLACK_MCP_XOXD_TOKEN`

### Installation

```bash
cd /root/vote_app/vote26/ai-context/mcp
git clone https://github.com/korotovsky/slack-mcp-server.git
cd slack-mcp-server
go build -o slack-mcp-server ./mcp/mcp-server.go
```

### Configuration

Create `.env` file:

```bash
# Required: Choose ONE authentication method

# Option A: User OAuth Token
SLACK_MCP_XOXP_TOKEN=xoxp-your-token

# Option B: Browser Tokens
SLACK_MCP_XOXC_TOKEN=xoxc-your-token
SLACK_MCP_XOXD_TOKEN=xoxd-your-cookie

# Optional: Network Settings
SLACK_MCP_PORT=13080
SLACK_MCP_HOST=127.0.0.1

# Optional: Message Posting (true = all channels, or comma-separated IDs)
SLACK_MCP_ADD_MESSAGE_TOOL=true
SLACK_MCP_ADD_MESSAGE_MARK=true

# Optional: Logging
SLACK_MCP_LOG_LEVEL=info
```

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "slack-advanced": {
      "command": "/root/vote_app/vote26/ai-context/mcp/slack-mcp-server/slack-mcp-server",
      "args": ["--transport", "stdio"],
      "env": {
        "SLACK_MCP_XOXC_TOKEN": "xoxc-your-token",
        "SLACK_MCP_XOXD_TOKEN": "xoxd-your-cookie",
        "SLACK_MCP_ADD_MESSAGE_TOOL": "true",
        "SLACK_MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

### Testing

Use the MCP inspector to test:

```bash
npx @modelcontextprotocol/inspector go run mcp/mcp-server.go --transport stdio
```

## Choosing Between Options

| Feature | Official (Archived) | Community (korotovsky) |
|---------|---------------------|------------------------|
| Maintenance | Archived | Active |
| Setup Complexity | Medium (needs app) | Easy (browser tokens) |
| Permissions | Bot scopes required | User-level access |
| Installation | npx (automatic) | Manual build (Go) |
| Features | Basic | Advanced |

**Recommendation:**
- Use **Official** for simplicity and if you already have a Slack app
- Use **Community** for more features and easier setup (no app creation needed)
