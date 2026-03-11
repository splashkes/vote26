# Art Battle Vote26

Multi-app platform for Art Battle live painting competitions — voting, bidding, artist management, event hosting, and administration. Built with React/Vite and Supabase.

## SPA Applications

Each app is a standalone React/Vite SPA with its own `deploy.sh`:

| App | Purpose |
|-----|---------|
| `art-battle-mui/` | Main public vote & bid app (mobile-first) |
| `art-battle-admin/` | Admin dashboard — event management, SMS campaigns, payments |
| `art-battle-artists/` | Artist portal — profiles, invitations, payment setup |
| `art-battle-broadcast/` | Live event broadcast display |
| `art-battle-host/` | Event host control panel |
| `art-battle-timer/` | Auction countdown timer display |
| `art-battle-results/` | Event results and winner displays |
| `art-battle-qr/` | QR code scanning and validation |
| `art-battle-promo-materials/` | Promotional material generation |
| `art-battle-promo-offers/` | Promotional offers and discounts |
| `art-battle-sponsorship/` | Sponsor management portal |
| `art-battle-external/` | External/embed widgets |
| `art-battle-ios/` | iOS app integration layer |

## Backend

- **Database**: Supabase (PostgreSQL) with 280+ migrations
- **Edge Functions**: 185+ Supabase Edge Functions in `supabase/functions/`
- **Integrations**: Stripe payments, Telnyx/Twilio SMS, AWS SES email, Eventbrite, Slack, Grafana, Meta Ads

## Agent Skills

Repo-owned AI/agent skills live in `agent-skills/`.

- Canonical source: `agent-skills/<skill-name>/`
- Runtime install target: `$CODEX_HOME/skills/`
- Install/sync command:

```bash
./scripts/install-agent-skills.sh
```

Use `./scripts/install-agent-skills.sh link` if you want `$CODEX_HOME/skills` to symlink back to the repo copy during local development.

## Deployment

Each SPA deploys independently via its `deploy.sh` to DigitalOcean Spaces CDN:
```bash
cd art-battle-<app> && ./deploy.sh
```

Edge functions deploy via:
```bash
supabase functions deploy <function-name>
```

Database migrations:
```bash
PGPASSWORD=$(cat ~/creds/supabase/db-password) psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/<file>.sql
```

## Project Structure

```
vote26/
├── art-battle-*/          # 13 SPA applications (each with src/, deploy.sh)
├── supabase/functions/    # Canonical edge function source
├── supabase-functions/    # Backup copy of deployed functions
├── migrations/            # 280+ SQL migration files
├── scripts/               # Utility scripts (JS, SH, SQL)
├── agent-skills/          # Canonical repo-owned agent skills
├── config/                # nginx and grafana configs
├── docs/                  # Organized documentation
│   ├── architecture/      # System design, competition rules, data access
│   ├── auth/              # Authentication guides
│   ├── payments/          # Payment system docs
│   ├── sms/               # SMS/Telnyx/Twilio docs
│   ├── deployment/        # Deploy guides, Slack, cron setup
│   ├── security/          # Security guides and reports
│   ├── integrations/      # Grafana, QR, email, Cloudflare, iOS
│   └── archive/           # Historical session logs and incident reports
├── ai-context/            # AI agent context files
├── CLAUDE.md              # Claude Code project instructions
└── EDGE_FUNCTION_DEBUGGING_SECRET.md  # Edge function debugging reference
```

## Tech Stack

- **Frontend**: React 18, Vite, Radix UI Themes
- **Database**: Supabase (PostgreSQL), Realtime subscriptions
- **Payments**: Stripe Connect (artist payouts), Stripe Checkout
- **SMS**: Telnyx (primary), Twilio (legacy)
- **Email**: AWS SES
- **CDN**: DigitalOcean Spaces, Cloudflare
- **Monitoring**: Grafana dashboards
