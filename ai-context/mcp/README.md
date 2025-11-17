# MCP Server Setup Guide

This directory contains configuration and setup instructions for Model Context Protocol (MCP) servers.

## Overview

MCP servers provide structured access to external services, enabling Claude to interact with platforms like Slack and Cloudflare through natural language.

## Available Servers

### 1. Slack MCP Server

Enables Claude to interact with your Slack workspace.

**Capabilities:**
- List channels and direct messages
- Read message history
- Post messages and replies
- Add reactions
- Search conversations

**Setup Options:**
- Official (archived): `@modelcontextprotocol/server-slack`
- Community (actively maintained): `korotovsky/slack-mcp-server`

### 2. Cloudflare MCP Servers

Cloudflare provides 15+ managed MCP servers for their services.

**Available Services:**
- **Documentation**: Product reference information
- **Workers**: Build and manage Workers
- **Observability**: Debug logs and analytics
- **DNS**: Manage DNS records and analytics
- **Security**: Audit logs, CASB analytics
- **AI Gateway**: Search logs and analyze AI requests
- **Radar**: Internet traffic insights
- **Browser Rendering**: Screenshots and web scraping
- And more...

## Configuration Files

- `slack-config.json` - Slack MCP server configuration template
- `cloudflare-config.json` - Cloudflare MCP servers configuration template
- `setup-slack.md` - Detailed Slack setup instructions
- `setup-cloudflare.md` - Detailed Cloudflare setup instructions

## Quick Start

1. Choose which MCP servers you want to enable
2. Follow the setup instructions in the respective markdown files
3. Merge the configuration into your `~/.claude/settings.json`
4. Restart Claude Code

## Security Notes

- Never commit tokens or API keys to git
- Store sensitive credentials in environment variables
- Use `.env` files (added to `.gitignore`) for local development
- Consider using Cloudflare's OAuth flow for production use
