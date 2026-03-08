# Security Posture

> **LIVING DOCUMENT — PROVISIONAL**
> Created 2026-03-08 from automated codebase analysis. Treat all content as approximate
> until manually verified. Expected to stabilize after ~12 update cycles. If something
> looks wrong, it probably is — fix it here.

## Authentication Architecture

### Flow

```
User (phone) → Supabase Auth (OTP) → JWT → RLS Policies → Data Access
                     ↓
              Edge Function webhooks handle business logic AFTER auth
```

### Two Registration Paths

**QR Code Registration:**
1. Scan QR → system creates auth.users with `{person_id: "existing-uuid"}` metadata
2. User completes OTP verification
3. `validate-qr-scan` edge function links existing person record

**Direct OTP Registration:**
1. User signs up (no QR metadata)
2. Completes OTP → auth.users created
3. `auth-webhook` edge function finds person by phone OR creates new person

### Critical Auth Rules

These were learned through painful production failures during live events:

- **NEVER** create triggers that UPDATE `auth.users` — breaks OTP verification
- **NEVER** modify `raw_user_meta_data` in BEFORE triggers
- **NEVER** use BEFORE INSERT/UPDATE triggers on `auth.users`
- Auth verification happens FIRST (Supabase handles)
- Person linking happens AFTER (our code handles via webhooks)
- Never try to do both simultaneously

## Row Level Security (RLS)

- **77 tables** with RLS enabled
- **150+ policies** across 35+ migration files
- All public schema tables have RLS enabled
- Write operations go through validated RPC functions, not direct table access

### Key Protected Operations

| Operation | Protection | Function |
|-----------|-----------|----------|
| Voting | Server-side RPC | `cast_vote_secure()` |
| Bidding | Server-side RPC | `process_bid_secure()` |
| Admin actions | Permission check | `check_event_admin_permission()` |
| Payment data | Role-based RLS | Restricted to ABHQ admins |
| Artist auth logs | RLS policy | Restricted to ABHQ admins |

## Schema Poisoning Prevention

All SECURITY DEFINER functions set `search_path = pg_catalog, public` to prevent search path manipulation. This was applied to 12 critical functions after a security review (Sept 2025).

## Edge Function Authentication

Most edge functions verify JWT tokens:
```typescript
const { data: { user } } = await supabase.auth.getUser(token);
```

Functions with `verify_jwt = false` in `supabase/config.toml` (public/system endpoints):
- `health-report-public` — public health check
- `meta-ads-report` — reporting endpoint
- `sms-marketing-webhook`, `sms-twilio-webhook` — inbound SMS
- `auth-monitor-cron`, `sms-scheduled-campaigns-cron` — cron jobs
- `email-queue-manager`, `populate-email-queue` — internal email processing
- `stripe-webhook-handler` — Stripe callbacks (validated by Stripe signature)

## Admin Access Control

Admin operations require:
1. Valid JWT from Supabase Auth
2. Active record in `abhq_admin_users` table with appropriate `level`
3. Per-function permission checks

## Credential Management

| Credential | Location | Notes |
|------------|----------|-------|
| Database password | `~/creds/supabase/db-password` | NOT in repo |
| Supabase anon key | `.env` files per SPA | Public key (safe for frontend) |
| Supabase service role key | Edge function env only | Never exposed to frontend |
| Stripe keys | Edge function env vars | Webhook signatures validated |
| Telnyx API key | Edge function env vars | — |
| Cloudflare tokens | Worker env vars | — |
| Slack tokens | GitHub Actions secrets + MCP config | — |

## Known Security Decisions

- Supabase anon key is intentionally public (designed for frontend use)
- Phone numbers are stored in multiple formats across `people.phone` and `people.phone_number` — normalization happens at query time
- QR codes contain person metadata — validated server-side on scan
- Edge functions use CORS `Access-Control-Allow-Origin: *` for cross-origin SPA access

## Monitoring

- `auth-monitor-cron` — automated auth health checks
- `admin-security-monitor` — admin-triggered security scans
- `scripts/test_security_monitor.sh` — manual security check script
- `scripts/emergency_auth_monitor.sh` — live event emergency monitor (1s polling)

See also: `docs/security/DETAILED_SECURITY_IMPLEMENTATION_GUIDE.md`, `docs/security/SECURITY_REPORT.md`
