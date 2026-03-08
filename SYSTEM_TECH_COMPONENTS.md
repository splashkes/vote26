# Art Battle System: Basic Tech Components, URLs, and Access Paths

> Snapshot captured on 2026-03-04 from this repository and local DNS lookups. No secrets or credential values are included.

## 1) Core topology
- **Primary domain**: `artb.art`
- **Primary SPA host**: `https://artb.art` (main voting app UI)
- **CDN bucket (DigitalOcean Spaces)**: `artb` in `tor1` (`https://artb.tor1.cdn.digitaloceanspaces.com`)
- **API/Database proxy host**: `db.artb.art` (CNAME)
- **Supabase project**: `xsqdkubgyqwpyvfltnrf.supabase.co`
- **Media CDN**: `imagedelivery.net`
- **Cloudflare upload worker**: `https://art-battle-image-upload-production.simon-867.workers.dev`

## 2) DNS-resolved addresses (as of 2026-03-04)
- `artb.art` → `138.197.174.128`
- `db.artb.art` (`CNAME` → `xsqdkubgyqwpyvfltnrf.supabase.co`) → `104.18.38.10`, `172.64.149.246`
- `xsqdkubgyqwpyvfltnrf.supabase.co` → `104.18.38.10`, `172.64.149.246`
- `artb.tor1.cdn.digitaloceanspaces.com` → `172.64.145.29`, `104.18.42.227`
- `imagedelivery.net` → `104.18.2.36`, `104.18.3.36`
- `art-battle-image-upload-production.simon-867.workers.dev` → `172.64.80.1`
- `webhook.artb.art` → no public A/AAAA/CNAME in this DNS check (uses server config path)

## 3) Frontend surfaces (public paths)
### Main user app
- Deployed to CDN path: `/vote26/`
- Public domain path: `/` on `artb.art`
- SPA route families (from `art-battle-broadcast/src/App.jsx`):
  - `/` event list
  - `/e/:eid` and `/e/:eid/:tab` event resolver
  - `/event/:eventId` details by event UUID
  - `/upgrade/:qrCode`
  - `/payment/:sessionId`

### Admin and partner apps
- `art-battle-admin` → `https://artb.art/admin/`
- `art-battle-artists` → `https://artb.art/profile/`
- `art-battle-promo-offers`:
  - Public hash offers: `https://artb.art/o/{HASH}`
  - Admin UI: `https://artb.art/o/admin`
- `art-battle-promo-materials` → `https://artb.art/promo/`
- `art-battle-results` → `https://artb.art/results/`
- `art-battle-sponsorship` → `https://artb.art/sponsor/`
- `art-battle-host` → `https://artb.art/host/`
- `art-battle-qr` → `https://artb.art/qr/`
- `art-battle-mui` analytics → `https://artb.art/analytics/`
- `art-battle-timer` → `https://artb.art/timer/`
- `art-battle-v2` route layer: `https://artb.art/v2/` (Nginx-driven SPA route to `vote26-v2` assets)

## 4) API and function access pathways
### Supabase API endpoints
- **Public API proxy**: `https://db.artb.art`
- **Functions base (project canonical)**: `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1`
- **Broadcast app helper base**: `https://db.artb.art/functions/v1`

### Public/live polling endpoints (via Nginx)
- `https://artb.art/live/events`
- `https://artb.art/live/event/{eventId}`
- `https://artb.art/live/bids/{eventEid}`
- `https://artb.art/live/votes/{eventEid}`

### Stripe webhook ingress
- `https://webhook.artb.art/stripe/webhook` → `stripe-webhook-handler` edge function

### Notable function groups
- Public data + voting/auction: `v2-public-events`, `v2-public-event`, `v2-public-votes`, `v2-public-bids`
- Payments: `process-artist-payment`, `process-pending-payments`, `stripe-*`, `auto-process-artist-payment*`
- Promotions/OFFERS: `promo-offers-*`, `promo-materials-data`, `promo-generator`, `offers` workflows
- SMS/notification: `send-sms`, `send-marketing-sms`, `sms-marketing-*`, `send-email`, `send-custom-email`
- Admin toolchain: `admin-*` functions (artist/event/search/admin actions)
- Content/media: `generate-qr-code`, `qr-scan`, `app-content-curator`, `paperwork-data`

## 5) Data layer / persistence access
- PostgreSQL endpoint used in scripts/migrations: `db.artb.art` on TCP `5432`
- Database name: `postgres`
- DB user commonly used: `postgres`
- Path style used for psql access in repo scripts and docs
- Additional data access path: Supabase `rest` APIs + direct RPC/db functions through project API
- No credential values are included here; use environment or vaults per deployment docs.

## 6) Media and file access
- Asset source for app shells/branding: DigitalOcean CDN (`artb.tor1.cdn.digitaloceanspaces.com`, usually published under app-specific subpaths)
- Artist/admin uploads go through Cloudflare worker and are stored in Cloudflare Images.
- Cloudflare image variant paths follow `https://imagedelivery.net/{account}/{id}/{variant}` (for example `public`, `thumbnail`, `original`).

## 7) Useful key documents (absolute paths)
- [AB_SKILL_AREAS_REFERENCE.md](/Users/splash/vote26-fresh/AB_SKILL_AREAS_REFERENCE.md)
- [analytics-documentation.md](/Users/splash/vote26-fresh/analytics-documentation.md)
- [ARTIST_AUCTION_PORTION_SYSTEM_DOCUMENTATION.md](/Users/splash/vote26-fresh/ARTIST_AUCTION_PORTION_SYSTEM_DOCUMENTATION.md)
- [COMPETITION_SPECIFICS_SYSTEM.md](/Users/splash/vote26-fresh/COMPETITION_SPECIFICS_SYSTEM.md)
- [CRITICAL_AUTH_ARCHITECTURE_DOCUMENTATION.md](/Users/splash/vote26-fresh/CRITICAL_AUTH_ARCHITECTURE_DOCUMENTATION.md)
- [MCP_ART_BATTLE_SCOPE_2026-02-02.md](/Users/splash/vote26-fresh/MCP_ART_BATTLE_SCOPE_2026-02-02.md)
- [SUPABASE_DATA_ACCESS_GUIDE.md](/Users/splash/vote26-fresh/SUPABASE_DATA_ACCESS_GUIDE.md)
- [SUPABASE_FUNCTION_USAGE_AUDIT.md](/Users/splash/vote26-fresh/SUPABASE_FUNCTION_USAGE_AUDIT.md)

## 8) Skill paths available to agents (absolute)
- [ab-data-diagnostics-repair](/Users/splash/.codex/skills/ab-data-diagnostics-repair/SKILL.md)
- [ab-spa-webapp-interactions](/Users/splash/.codex/skills/ab-spa-webapp-interactions/SKILL.md)
- [build-things](/Users/splash/.codex/skills/build-things/SKILL.md)
- [skill-creator](/Users/splash/.codex/skills/skill-creator/SKILL.md)
- [skill-installer](/Users/splash/.codex/skills/skill-installer/SKILL.md)

## 9) Notes for handoff
- This inventory covers runtime-facing URLs and access paths used by app code and deploy configs in this repo.
- No API keys, service tokens, JWTs, or DB passwords are recorded in this document.
- If a component is missing from this list, verify `vite.config` and route declarations under `art-battle-*/src/App*`.
