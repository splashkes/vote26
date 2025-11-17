#!/bin/bash

# MCP Configuration Merge Script
# This script helps merge MCP server configurations into your Claude settings.json

SETTINGS_FILE="$HOME/.claude/settings.json"
BACKUP_FILE="$HOME/.claude/settings.json.backup.$(date +%Y%m%d_%H%M%S)"

echo "MCP Configuration Merge Tool"
echo "=============================="
echo ""

# Check if settings.json exists
if [ ! -f "$SETTINGS_FILE" ]; then
    echo "Error: $SETTINGS_FILE not found!"
    exit 1
fi

# Create backup
echo "Creating backup: $BACKUP_FILE"
cp "$SETTINGS_FILE" "$BACKUP_FILE"

echo ""
echo "Which MCP servers do you want to configure?"
echo ""
echo "1) Slack (Official)"
echo "2) Cloudflare servers"
echo "3) Both"
echo "4) Manual merge (show commands)"
echo ""
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        echo ""
        echo "Configuring Slack MCP Server..."
        echo ""
        read -p "Enter your SLACK_BOT_TOKEN (xoxb-...): " slack_token
        read -p "Enter your SLACK_TEAM_ID (T...): " team_id
        read -p "Enter SLACK_CHANNEL_IDS (comma-separated, optional): " channel_ids

        # Use jq to merge if available, otherwise show manual instructions
        if command -v jq &> /dev/null; then
            jq --arg token "$slack_token" \
               --arg team "$team_id" \
               --arg channels "$channel_ids" \
               '.mcpServers.slack = {
                  "command": "npx",
                  "args": ["-y", "@modelcontextprotocol/server-slack"],
                  "env": {
                    "SLACK_BOT_TOKEN": $token,
                    "SLACK_TEAM_ID": $team,
                    "SLACK_CHANNEL_IDS": $channels
                  }
                }' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
            echo "Configuration updated successfully!"
        else
            echo ""
            echo "jq not found. Please manually add this to your settings.json:"
            echo ""
            cat <<EOF
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "$slack_token",
        "SLACK_TEAM_ID": "$team_id",
        "SLACK_CHANNEL_IDS": "$channel_ids"
      }
    }
  }
}
EOF
        fi
        ;;
    2)
        echo ""
        echo "Configuring Cloudflare MCP Servers..."
        echo ""
        read -p "Enter your CLOUDFLARE_API_TOKEN (cf_...): " cf_token
        read -p "Enter your CLOUDFLARE_ACCOUNT_ID: " cf_account

        if command -v jq &> /dev/null; then
            jq --arg token "$cf_token" \
               --arg account "$cf_account" \
               '.mcpServers["cloudflare-observability"] = {
                  "command": "npx",
                  "args": ["mcp-remote", "https://observability.mcp.cloudflare.com/mcp"],
                  "env": {
                    "CLOUDFLARE_API_TOKEN": $token,
                    "CLOUDFLARE_ACCOUNT_ID": $account
                  }
                } |
                .mcpServers["cloudflare-workers"] = {
                  "command": "npx",
                  "args": ["mcp-remote", "https://workers-bindings.mcp.cloudflare.com/mcp"],
                  "env": {
                    "CLOUDFLARE_API_TOKEN": $token,
                    "CLOUDFLARE_ACCOUNT_ID": $account
                  }
                } |
                .mcpServers["cloudflare-dns"] = {
                  "command": "npx",
                  "args": ["mcp-remote", "https://dns.mcp.cloudflare.com/mcp"],
                  "env": {
                    "CLOUDFLARE_API_TOKEN": $token
                  }
                }' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
            echo "Configuration updated successfully!"
        else
            echo ""
            echo "jq not found. Please use the cloudflare-config-template.json as reference."
            echo "Template location: $(pwd)/cloudflare-config-template.json"
        fi
        ;;
    3)
        echo "Please run this script twice, once for each option."
        ;;
    4)
        echo ""
        echo "Manual Merge Instructions:"
        echo "=========================="
        echo ""
        echo "1. Open your settings file: $SETTINGS_FILE"
        echo "2. Add or merge the 'mcpServers' section from templates:"
        echo "   - Slack: $(pwd)/slack-config-template.json"
        echo "   - Cloudflare: $(pwd)/cloudflare-config-template.json"
        echo "3. Replace placeholder values with your actual credentials"
        echo "4. Save and restart Claude Code"
        echo ""
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "Backup created at: $BACKUP_FILE"
echo ""
echo "Next steps:"
echo "1. Verify your configuration: cat $SETTINGS_FILE"
echo "2. Restart Claude Code for changes to take effect"
echo ""
