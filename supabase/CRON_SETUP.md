# Meta Ads Cache Cron Job Setup

This document explains how to set up the automated cron job that caches Meta Ads data for upcoming events.

## Overview

The cron job runs daily at 8:00 AM UTC and caches Meta Ads data for events with start dates from 2 days ago to 33 days in the future.

## Components

1. **Database Function**: `cache_meta_ads_data()` - Queries events and calls the edge function
2. **Edge Function**: `meta-ads-report` - Fetches data from Meta API and caches it
3. **Cron Schedule**: Runs daily at 8:00 AM UTC via pg_cron

## Setup Steps

### 1. Generate a Strong Random Secret

```bash
openssl rand -hex 32
```

Example output: `47beae40b1cad87a1a3cbed4eac5ea8269b23ada649ee17a6034242d9699f045`

### 2. Store the Secret in the Database (cron_secrets table)

```sql
INSERT INTO cron_secrets (name, secret_value)
VALUES ('meta_ads_cron', 'YOUR-GENERATED-SECRET-HERE')
ON CONFLICT (name) DO UPDATE SET secret_value = EXCLUDED.secret_value, updated_at = now();
```

**Security Note**: The `cron_secrets` table has RLS enabled with no policies, making it inaccessible via the Supabase API. Only SECURITY DEFINER database functions can read from it.

### 3. Set the Same Secret in Supabase Edge Function Secrets

```bash
cd /root/vote_app/vote26/supabase
supabase secrets set CRON_SECRET_META_ADS=YOUR-GENERATED-SECRET-HERE
```

**IMPORTANT**: The secret must match in both places!

### 4. Verify the Cron Job is Scheduled

Check that the cron job is scheduled:

```sql
SELECT * FROM cron.job WHERE jobname = 'meta-ads-cache-daily';
```

You should see:
- Schedule: `0 8 * * *` (8:00 AM UTC daily)
- Command: `SELECT cache_meta_ads_data()`

### 5. Manual Test

Test the function manually:

```sql
SELECT cache_meta_ads_data();
```

This will return a JSON object with:
```json
{
  "success": true,
  "date_range": {
    "start": "2025-10-05T...",
    "end": "2025-11-09T..."
  },
  "total_events": 5,
  "cached_events": 5,
  "completed_at": "2025-10-07T..."
}
```

## Security

- The cron secret is used to authenticate cron job requests to the edge function
- The secret is stored in two places:
  1. Database settings (for the cron function to use)
  2. Supabase edge function secrets (for the edge function to validate)
- Regular users cannot call the edge function without JWT authentication
- Only the cron job can use the `X-Cron-Secret` header for authentication

## Monitoring

### Check Recent Cron Executions

```sql
SELECT * FROM meta_ads_cache_cron_log
ORDER BY executed_at DESC
LIMIT 10;
```

### View pg_cron Execution History

```sql
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'meta-ads-cache-daily')
ORDER BY start_time DESC
LIMIT 10;
```

## Troubleshooting

### Cron Job Not Running

Check if pg_cron is enabled:
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```

### Authentication Errors

Verify the cron secret is set in the database:
```sql
SELECT name, created_at, updated_at FROM cron_secrets WHERE name = 'meta_ads_cron';
```

Then check Supabase secrets:
```bash
supabase secrets list
```

The secret must match in both places. To view the actual secret value (use with caution):
```sql
SELECT secret_value FROM cron_secrets WHERE name = 'meta_ads_cron';
```

### Check Function Logs

View edge function logs in Supabase Dashboard:
https://supabase.com/dashboard/project/xsqdkubgyqwpyvfltnrf/functions/meta-ads-report/logs

## Updating the Schedule

To change the schedule, run:

```sql
-- Unschedule old job
SELECT cron.unschedule('meta-ads-cache-daily');

-- Reschedule with new time (example: 6:00 AM UTC)
SELECT cron.schedule(
  'meta-ads-cache-daily',
  '0 6 * * *',
  $$SELECT cache_meta_ads_data()$$
);
```

## Manual Cache Refresh

To manually refresh cache for a specific event:

```bash
curl -X GET 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report/AB3023' \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Or call from the database:

```sql
SELECT cache_meta_ads_data();
```
