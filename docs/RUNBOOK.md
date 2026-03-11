# Operations Runbook

> **LIVING DOCUMENT — PROVISIONAL**
> Created 2026-03-08 from automated codebase analysis. Treat all content as approximate
> until manually verified. Expected to stabilize after ~12 update cycles. If something
> looks wrong, it probably is — fix it here.

## Deployment

### SPA Deployment

Each SPA deploys independently. Always use the deploy script — it handles build + CDN sync.

```bash
cd art-battle-<app> && ./deploy.sh
```

Deploy scripts: build via Vite, cache-bust `index.html`, sync to DigitalOcean Spaces (`s3://artb/<path>/`).

Operational note:
- On some developer machines `s3cmd` defaults to Cloudflare R2 via `~/.s3cfg`.
- For SPA deploys, force or auto-select the DigitalOcean config (`~/.s3cfg-do-spaces`) before upload.
- Fail fast if `s3://artb/` is not reachable with the active `s3cmd` config.

### Edge Function Deployment

```bash
# From project root
supabase functions deploy <function-name>

# Verify deployment
supabase functions list | grep <function-name>
```

Functions deploy from `supabase/functions/`. After deploying, sync the backup copy in `supabase-functions/` if you want it current.

### Database Migrations

```bash
PGPASSWORD=$(cat ~/creds/supabase/db-password) psql \
  -h db.xsqdkubgyqwpyvfltnrf.supabase.co \
  -p 5432 -d postgres -U postgres \
  -f migrations/<MIGRATION_FILE>.sql
```

## Edge Function Debugging

**Supabase function logs do not work reliably.** Do not rely on `supabase functions logs`.

Instead, return debug info in the response body:

```typescript
return new Response(JSON.stringify({
  success: false,
  error: error.message,
  debug: {
    timestamp: new Date().toISOString(),
    error_type: error.constructor.name,
    stack: error.stack,
    received_data: requestBody,
    function_name: 'your-function-name'
  }
}), { status: 500, headers: corsHeaders });
```

Read the full approach: `EDGE_FUNCTION_DEBUGGING_SECRET.md` (root).

## Live Event Monitoring

### Pre-Event Health Check

Run from project root:
```bash
./scripts/system_health_monitor.sh
```

Generates a micro-report covering: auth metrics, voting/bidding activity, QR scans, payment sessions, error indicators, and DB performance.

### Emergency Auth Monitor

For live events with auth issues — polls every 1 second:
```bash
./scripts/emergency_auth_monitor.sh
```

Detects: unlinked users, missing metadata, wrong person_id links, unverified users causing loading loops. Auto-fixes via `emergency_fix_unlinked_users()` RPC.

## Database Access

```bash
# Interactive console
PGPASSWORD=$(cat ~/creds/supabase/db-password) psql \
  -h db.xsqdkubgyqwpyvfltnrf.supabase.co \
  -p 5432 -d postgres -U postgres
```

## Backups

Scripts in `scripts/`:
- `supabase-comprehensive-backup.sh` — full database backup
- `daily-backup.sh` — scheduled daily
- `mini-backup.sh` — quick snapshot
- `smart-backup-retention.sh` — retention policy
- `compress-existing-backups.sh` — archive old backups

Backups stored in `supabase-backups/`.

## Slack Notifications

Processed by GitHub Actions every 2 minutes (`.github/workflows/process-slack-queue.yml`):
1. Calls `manual_process_slack_queue` RPC
2. Sends notifications via `slack-webhook` edge function
3. Closes expired auctions via `check_and_close_expired_auctions` RPC

Monitor queue: `SELECT * FROM get_slack_queue_status();`

Rate limit: 10/batch, 300/hour.

## Stripe Payments

- Webhook handler: `stripe-webhook-handler` edge function
- Checkout: `stripe-create-checkout` → `stripe-payment-success`
- Artist payouts: `stripe-connect-onboard` → `stripe-global-payments-payout`
- Instant payouts: `check-instant-payout-eligibility` → `process-instant-payout`

### Event Payment Incident Pattern

If an event payment screen shows artists in both `Ready to Pay` and `In Progress`, or event-scoped `Pay Now` does nothing:

1. Check `events.currency` first.
2. Compare it to `cities -> countries.currency_code` and to `payment_processing.currency` for paid art.
3. Verify the event payment RPCs directly:
   - `get_event_ready_to_pay(uuid)`
   - `get_event_payment_attempts(uuid, days)`
4. Verify the event payment edge function payload:
   - `event-admin-payments`
5. Verify the write path:
   - SPA payload includes the correct `artist_profile_id`
   - SPA payload includes `event_id`
   - `process-artist-payment` stores a representative `art_id` for the event

Ottawa incident learnings:
- `admin-create-event` had hardcoded new events to `USD`
- `get_event_ready_to_pay(uuid)` was stale and did not exclude active attempts
- event payment UI sent the wrong artist identifier and omitted `event_id`
- fixing only one layer was not sufficient; data, RPCs, edge functions, and SPA all had to align

## SMS Campaigns

- Primary provider: Telnyx
- Legacy: Twilio
- Campaign flow: `admin-sms-promotion-audience` → `admin-sms-create-campaign` → `send-bulk-marketing-sms`
- Scheduled sends: `sms-scheduled-campaigns-cron` edge function
- Inbound webhooks: `sms-marketing-webhook`, `sms-twilio-webhook`

## Common Issues

### "Function not found in schema cache"
An edge function is calling an RPC that doesn't exist in the database. Create the missing PostgreSQL function via a migration, then redeploy the edge function.

### Auth loading loops
User verified but metadata not linked. Run `emergency_auth_monitor.sh` or check for unlinked users:
```sql
SELECT id, phone, email_confirmed_at, raw_user_meta_data
FROM auth.users
WHERE email_confirmed_at IS NOT NULL
AND raw_user_meta_data->>'person_id' IS NULL
ORDER BY created_at DESC LIMIT 20;
```

### Stale CDN cache
Deploy scripts add cache-busting query params to JS/CSS. If `index.html` is stale, it's a CDN edge cache issue — wait or purge manually.
