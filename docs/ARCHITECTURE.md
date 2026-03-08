# Architecture Overview

> **LIVING DOCUMENT — PROVISIONAL**
> Created 2026-03-08 from automated codebase analysis. Treat all content as approximate
> until manually verified. Expected to stabilize after ~12 update cycles. If something
> looks wrong, it probably is — fix it here.

## System Overview

vote26 is a multi-SPA platform for Art Battle live painting competitions. It provides voting, live auction bidding, artist management, event hosting, SMS marketing, payment processing, and administration across 13 independent frontend applications backed by Supabase (PostgreSQL + Edge Functions).

## SPA Applications & Deployment Map

All SPAs deploy to **DigitalOcean Spaces** bucket `artb` (tor1 region) via individual `deploy.sh` scripts. Public domain: `artb.art`.

| SPA | CDN Path | URL | Purpose |
|-----|----------|-----|---------|
| art-battle-broadcast | `vote26/` | artb.art/vote26/ | Main public voting & bidding app |
| art-battle-admin | `admin/` | artb.art/admin/ | Admin dashboard, SMS campaigns, payments |
| art-battle-artists | `profile/` | artb.art/profile/ | Artist portal, invitations, payment setup |
| art-battle-host | `host/` | artb.art/host/ | Event host control panel |
| art-battle-mui | `analytics/` | artb.art/analytics/ | Analytics display |
| art-battle-results | `results/` | artb.art/results/ | Event results and winners |
| art-battle-timer | `timer/` | artb.art/timer/ | Auction countdown display |
| art-battle-qr | `qr/` | artb.art/qr/ | QR code scanning |
| art-battle-promo-materials | `promo/` | artb.art/promo/ | Promotional material generation |
| art-battle-promo-offers | `promo_offers/` | artb.art/o/{hash} | Promotional offers |
| art-battle-sponsorship | `sponsor/` | artb.art/sponsor/ | Sponsor management |
| art-battle-external | — | — | External/embed widgets |
| art-battle-ios | — | — | iOS app integration layer |

**Cache strategy** (all SPAs): `index.html` no-cache; JS/CSS assets 1yr immutable with version query params.

## Shared Tech Stack

All SPAs share:
- React 19, Vite, React Router DOM 7
- @supabase/supabase-js v2.53–2.57
- @radix-ui/themes + @radix-ui/react-icons
- Independent builds — no monorepo tooling

Root `src/` contains shared utilities (supabase client, privacy utils) but each SPA has its own `src/`.

## Backend: Supabase

### Database
- PostgreSQL via Supabase
- 281+ migrations in `migrations/`
- Direct access: `db.xsqdkubgyqwpyvfltnrf.supabase.co:5432` (password in `~/creds/supabase/db-password`)
- Public proxy: `db.artb.art:5432`

### Edge Functions (~185 functions)

Deployed from `supabase/functions/` (canonical source). Backup copy in `supabase-functions/`.

| Category | Count | Prefix/Pattern | Notes |
|----------|-------|----------------|-------|
| Admin operations | ~55 | `admin-*` | Event, artist, payment, SMS management |
| Payments & Stripe | ~15 | `stripe-*`, `process-*` | Webhooks, checkout, Connect, payouts |
| Authentication | ~8 | `auth-*`, `custom-access-token` | Webhooks, monitoring, invitations |
| SMS & Comms | ~12 | `send-sms`, `sms-*`, `phone-*` | Telnyx primary, Twilio legacy |
| Email | ~8 | `send-email*`, `email-*` | AWS SES |
| Public/Voting | ~10 | `v2-public-*`, `secure-bid` | Cached public endpoints |
| Analytics | ~8 | `app-analytics-*`, `public-analytics` | Batch analytics, personalization |
| Promotions | ~5 | `promo-*` | Offers, redemption, tracking |
| Integrations | ~12 | `slack-*`, `fetch-eventbrite-*`, `sponsorship-*` | Slack, Eventbrite, sponsors |
| Events/Competition | ~10 | `*-competition-*`, `event-linter` | Competition specifics, linting |
| Test/Debug | ~25 | `test-*` | Development aids |
| Shared | — | `_shared/` | `cors.ts`, `emailTemplates.ts` |

### Key RPC Functions

Core operations go through PostgreSQL RPC functions, not direct table access:

- **Voting**: `cast_vote_secure()` — server-side validated
- **Bidding**: `process_bid_secure()` — auction logic with currency handling
- **Admin permissions**: `check_event_admin_permission()`
- **Auction control**: `manage_auction_timer()`, `check_and_close_expired_auctions()`
- **Config**: `get_cloudflare_config()` — used by admin, artists, broadcast

## External Services

| Service | Purpose | Config Location |
|---------|---------|----------------|
| Stripe | Payments, Connect payouts, checkout | Edge function env vars |
| Telnyx | SMS (primary) | `~/creds/`, edge function env |
| Twilio | SMS (legacy) | Edge function env vars |
| AWS SES | Email delivery | Edge function env vars |
| DigitalOcean Spaces | CDN for all SPAs | s3cmd config |
| Cloudflare Images | Image uploads | Worker in `cloudflare-worker/` |
| Eventbrite | Event ticketing sync | Edge function env vars |
| Slack | Notifications | Edge functions + GitHub Actions |
| Grafana | Monitoring dashboards | `config/grafana/` |
| Meta Ads | Ad reporting | Edge function cron |

## Automation

| What | How | Frequency |
|------|-----|-----------|
| Slack queue processing | GitHub Actions (`process-slack-queue.yml`) | Every 2 minutes |
| Auction expiry checks | Same GitHub Actions workflow | Every 2 minutes |
| SMS scheduled campaigns | `sms-scheduled-campaigns-cron` edge function | Cron-triggered |
| Auth monitoring | `auth-monitor-cron` edge function | Cron-triggered |
| Meta ads cache | `meta-ads-cache-cron` edge function | Cron-triggered |
| Exchange rates | `update-exchange-rates` edge function | Cron-triggered |

## Directory Structure

```
vote26/
├── art-battle-*/           # 13 SPA applications
├── supabase/functions/     # Canonical edge function source (~185 functions)
├── supabase-functions/     # Backup copy of deployed functions
├── migrations/             # 281+ SQL migrations
├── scripts/                # Utility scripts (JS, SH, Python)
│   ├── sql/                # Debug/maintenance SQL scripts
│   └── data/               # Data exports and snapshots
├── config/
│   ├── nginx/              # Reverse proxy configs
│   └── grafana/            # Dashboard JSON exports
├── docs/                   # Organized documentation (you are here)
├── ai-context/             # AI agent context files
├── aws/                    # AWS CLI tools
├── cloudflare-worker/      # Image upload worker
├── src/                    # Shared root utilities
└── supabase-backups/       # Database backup archives
```
