# AI Agents & Automation

> **LIVING DOCUMENT — PROVISIONAL**
> Created 2026-03-08 from automated codebase analysis. Treat all content as approximate
> until manually verified. Expected to stabilize after ~12 update cycles. If something
> looks wrong, it probably is — fix it here.

## Overview

This project uses AI agents (Claude Code) as a primary development tool, with MCP (Model Context Protocol) integrations and dedicated context files for domain knowledge.

## Claude Code Configuration

### Project Instructions
- `CLAUDE.md` (root) — database credentials, migration commands, deployment rules
- `art-battle-admin/CLAUDE.md` — admin function naming (`admin-*` prefix), deploy workflow
- `.claude/` directories in individual SPAs may contain additional context

### Key Rules for AI Agents
1. **Never use `supabase functions logs`** — they don't work. Debug via response body (see `EDGE_FUNCTION_DEBUGGING_SECRET.md`)
2. **Always deploy via deploy.sh** — never manual s3cmd or build separately
3. **Supabase functions go in `supabase/functions/` only** — not `supabase-functions/` or anywhere else
4. **Database migrations**: use the psql command from CLAUDE.md with password from `~/creds/supabase/db-password`
5. **Admin edge functions**: always prefix with `admin-`
6. **Complex queries in edge functions**: create a PostgreSQL function via migration first, then call via `.rpc()`

## MCP Context Directory

`ai-context/` contains domain knowledge organized by topic:

| Directory | Purpose |
|-----------|---------|
| `ab6/` | AB6-specific context |
| `artist-accounts/` | Artist account management context |
| `auction-problems/` | Auction system troubleshooting |
| `duplicate_artists/` | Duplicate artist profile resolution |
| `email/` | Email system context |
| `event-linter/` | Event data validation rules |
| `eventbrite/` | Eventbrite integration context |
| `facebook/` | Facebook/Meta integration |
| `feedback/` | User feedback handling |
| `mcp/` | MCP server configuration |
| `offers/` | Promotional offers system |
| `sms/` | SMS campaign context |
| `sponsorship/` | Sponsorship system context |
| `stripe/` | Stripe payment integration |

### MCP Environment Variables

From `ai-context/mcp/.env.example`:
- Slack: `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`, `SLACK_CHANNEL_IDS`
- Slack community: `SLACK_MCP_XOXC_TOKEN`, `SLACK_MCP_XOXD_TOKEN`
- Cloudflare: API token, account ID, zone ID

## GitHub Actions Automation

Single workflow: `.github/workflows/process-slack-queue.yml`
- Runs every 2 minutes
- Processes Slack notification queue
- Closes expired auctions
- Reports success/failure counts

## Agent Specifications

Reference: `docs/architecture/ART_BATTLE_EVENT_ANALYST_AGENT_SPEC.md` — specification for an event analysis agent.

Reference: `docs/architecture/AB_SKILL_AREAS_REFERENCE.md` — comprehensive reference of Art Battle domain knowledge areas.

## Automated Monitoring Agents

| Script | Purpose | Trigger |
|--------|---------|---------|
| `scripts/system_health_monitor.sh` | Full system health report | Manual / pre-event |
| `scripts/emergency_auth_monitor.sh` | 1s-interval auth fix loop | Manual / live event emergency |
| `scripts/test_security_monitor.sh` | Security check validation | Manual |
| `auth-monitor-cron` (edge fn) | Automated auth health | Supabase cron |
| `admin-security-monitor` (edge fn) | Admin-triggered scan | On-demand |

## Development Patterns for AI Agents

### Before making changes
1. Read the relevant SPA's source and any CLAUDE.md
2. Check `ai-context/` for domain knowledge on the topic
3. Understand the deployment path (which deploy.sh, which CDN path)

### Edge function changes
1. Write/modify function in `supabase/functions/<name>/index.ts`
2. If complex queries needed, create PostgreSQL function via migration first
3. Deploy: `supabase functions deploy <name>`
4. Update backup copy in `supabase-functions/` if keeping it synced
5. Test via browser console or curl — debug info comes in response body

### SPA changes
1. Modify source in `art-battle-<app>/src/`
2. Test locally: `cd art-battle-<app> && npm run dev`
3. Deploy: `./deploy.sh` (builds automatically)

### Database changes
1. Create migration file in `migrations/`
2. Run via psql command from CLAUDE.md
3. Verify in database console
