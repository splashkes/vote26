# MCP Quick Start Guide

Get up and running with Slack and Cloudflare MCP servers in minutes!

## Prerequisites

- Claude Code CLI installed and running
- Node.js and npm installed
- Admin access to Slack workspace (for Slack)
- Cloudflare account (for Cloudflare)

## Option A: Quick Setup (Recommended)

### 1. Choose Your Setup

**For Slack (Easiest):**
```bash
cd /root/vote_app/vote26/ai-context/mcp
./merge-config.sh
# Choose option 1 and follow prompts
```

**For Cloudflare:**
```bash
cd /root/vote_app/vote26/ai-context/mcp
./merge-config.sh
# Choose option 2 and follow prompts
```

### 2. Get Your Credentials

#### Slack Bot Token:
1. Visit https://api.slack.com/apps
2. Create app → "From scratch"
3. Add bot token scopes (see setup-slack.md)
4. Install to workspace
5. Copy "Bot User OAuth Token"

#### Cloudflare API Token:
1. Visit https://dash.cloudflare.com/profile/api-tokens
2. Create Token → Custom token
3. Add permissions (Workers, DNS, etc.)
4. Copy token and Account ID

### 3. Restart Claude Code

After configuration, restart Claude Code for changes to take effect.

## Option B: Manual Setup

### 1. Copy Template

```bash
cd /root/vote_app/vote26/ai-context/mcp

# For Slack
cp slack-config-template.json ~/.claude/slack-mcp-config.json
# Edit and add your credentials

# For Cloudflare
cp cloudflare-config-template.json ~/.claude/cloudflare-mcp-config.json
# Edit and add your credentials
```

### 2. Merge into settings.json

Manually merge the `mcpServers` section from the template into your `~/.claude/settings.json`.

Example final settings.json:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    // your existing hooks...
  },
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-token",
        "SLACK_TEAM_ID": "T12345678",
        "SLACK_CHANNEL_IDS": ""
      }
    },
    "cloudflare-observability": {
      "command": "npx",
      "args": ["mcp-remote", "https://observability.mcp.cloudflare.com/mcp"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "cf_your_token",
        "CLOUDFLARE_ACCOUNT_ID": "your_account_id"
      }
    }
  }
}
```

## Testing Your Setup

### Test Slack Connection

Ask Claude:
```
"Can you list my Slack channels?"
"What were the last 5 messages in #general?"
"Post 'Hello from Claude!' to #test-channel"
```

### Test Cloudflare Connection

Ask Claude:
```
"List my Cloudflare Workers"
"Show me logs from my worker named 'api-handler'"
"What are my DNS records for example.com?"
```

## Troubleshooting

### "MCP server not found"
- Ensure you've restarted Claude Code after editing settings.json
- Verify the `mcpServers` section is properly formatted JSON
- Check that npx is in your PATH: `which npx`

### "Authentication failed"
- Verify your tokens are correct and not expired
- For Slack: ensure bot has required permissions
- For Cloudflare: check token permissions match the server

### "Command 'mcp-remote' not found"
- Run: `npm install -g mcp-remote`
- Or let npx install it on first use (may take a moment)

### Still having issues?
1. Check logs: `tail -f ~/.claude/debug/*.log`
2. Validate JSON: `cat ~/.claude/settings.json | jq .`
3. Review detailed setup guides:
   - `setup-slack.md`
   - `setup-cloudflare.md`

## Next Steps

### Add More Cloudflare Servers

Edit your settings.json to add more Cloudflare MCP servers:
- DNS: `https://dns.mcp.cloudflare.com/mcp`
- AI Gateway: `https://ai-gateway.mcp.cloudflare.com/mcp`
- Browser Rendering: `https://browser-rendering.mcp.cloudflare.com/mcp`
- Audit Logs: `https://audit-logs.mcp.cloudflare.com/mcp`

See `cloudflare-config-template.json` for full list.

### Advanced Slack Setup

For more features, try the community server:
```bash
cd /root/vote_app/vote26/ai-context/mcp
git clone https://github.com/korotovsky/slack-mcp-server.git
cd slack-mcp-server
go build -o slack-mcp-server ./mcp/mcp-server.go
```

See `setup-slack.md` for complete instructions.

## Security Reminders

- Never commit your `.env` file or tokens to git
- Use separate tokens with minimal permissions for each service
- Rotate tokens regularly
- Monitor usage through audit logs

## Getting Help

- Review detailed setup docs in this directory
- Check MCP documentation: https://modelcontextprotocol.io/
- Cloudflare Agents docs: https://developers.cloudflare.com/agents/
- Slack API docs: https://api.slack.com/
