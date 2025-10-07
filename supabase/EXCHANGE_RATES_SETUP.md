# Exchange Rates Cron Job Setup

This document explains how to set up the automated cron job that updates exchange rates for currency conversion in the admin interface.

## Overview

The cron job runs daily at 9:00 AM UTC (1 hour after the Meta ads cache job) and fetches exchange rates from a free API to display approximate USD conversions for event budgets in various currencies.

## Components

1. **Database Table**: `exchange_rates` - Stores currency conversion rates to USD
2. **Database Function**: `update_exchange_rates_cron()` - Calls the edge function via pg_net
3. **Edge Function**: `update-exchange-rates` - Fetches data from exchangerate-api.io and updates database
4. **Cron Schedule**: Runs daily at 9:00 AM UTC via pg_cron

## Setup Steps

### 1. Generate a Strong Random Secret

```bash
openssl rand -hex 32
```

Example output: `3c6847ab116a92d52a02bc3912cf9678b0d40ed222ec3a60b8bd626ca4b5a58e`

### 2. Store the Secret in the Database (cron_secrets table)

```sql
INSERT INTO cron_secrets (name, secret_value)
VALUES ('exchange_rates_cron', 'YOUR-GENERATED-SECRET-HERE')
ON CONFLICT (name) DO UPDATE SET secret_value = EXCLUDED.secret_value, updated_at = now();
```

**Security Note**: The `cron_secrets` table has RLS enabled with no policies, making it inaccessible via the Supabase API. Only SECURITY DEFINER database functions can read from it.

### 3. Set the Same Secret in Supabase Edge Function Secrets

```bash
cd /root/vote_app/vote26/supabase
supabase secrets set CRON_SECRET_EXCHANGE_RATES=YOUR-GENERATED-SECRET-HERE
```

**IMPORTANT**: The secret must match in both places!

### 4. Deploy the Edge Function

```bash
cd /root/vote_app/vote26/supabase
supabase functions deploy update-exchange-rates
```

### 5. Run the Migration

```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.artb.art -p 5432 -d postgres -U postgres -f migrations/20251007_create_exchange_rates.sql
```

This migration:
- Creates the `exchange_rates` table with RLS enabled
- Inserts initial rates for 9 currencies (USD, CAD, AUD, NZD, EUR, GBP, THB, JPY, CNY)
- Creates the `update_exchange_rates_cron()` function
- Schedules the daily cron job at 9:00 AM UTC

### 6. Verify the Cron Job is Scheduled

Check that the cron job is scheduled:

```sql
SELECT * FROM cron.job WHERE jobname = 'exchange-rates-daily';
```

You should see:
- Schedule: `0 9 * * *` (9:00 AM UTC daily)
- Command: `SELECT update_exchange_rates_cron()`

### 7. Manual Test

Test the function manually:

```sql
SELECT update_exchange_rates_cron();
```

This will call the edge function which updates all exchange rates.

Check the updated rates:

```sql
SELECT currency_code, rate_to_usd, source, last_updated
FROM exchange_rates
ORDER BY currency_code;
```

## How It Works

### Exchange Rate API

- Uses **exchangerate-api.io** free tier (1500 requests/month)
- No authentication required for free tier
- Endpoint: `https://open.exchangerate-api.com/v6/latest/USD`

### Rate Conversion

The API returns rates FROM USD (e.g., 1 USD = 1.396 CAD), but we need rates TO USD:

```
API gives: USD → CAD = 1.396
We store: CAD → USD = 1/1.396 = 0.716
```

This inversion is handled automatically in the edge function.

### Supported Currencies

- USD (always 1.0, base currency)
- CAD (Canadian Dollar)
- AUD (Australian Dollar)
- NZD (New Zealand Dollar)
- EUR (Euro)
- GBP (British Pound)
- THB (Thai Baht)
- JPY (Japanese Yen)
- CNY (Chinese Yuan)

## Frontend Integration

The admin interface (`EventDetail.jsx`) displays budgets with both native currency and USD approximation:

```
€250.00 EUR (~$293 USD)
฿17,000.00 THB (~$524 USD)
$200.00 AUD (~$132 USD)
```

The frontend:
1. Fetches exchange rates from the `exchange_rates` table on component mount
2. Stores rates in state for fast lookups
3. Calculates USD approximation: `amount × rate_to_usd`
4. Displays rounded USD value next to native currency

## Security

- The cron secret is used to authenticate cron job requests to the edge function
- The secret is stored in two places:
  1. Database `cron_secrets` table (for the cron function to use)
  2. Supabase edge function secrets (for the edge function to validate)
- Regular users cannot call the edge function without the cron secret
- Only the cron job can use the `X-Cron-Secret` header for authentication
- The `exchange_rates` table has RLS enabled with no policies (API inaccessible, only database functions can read)

## Monitoring

### Check Recent Exchange Rate Updates

```sql
SELECT currency_code, rate_to_usd, source, last_updated
FROM exchange_rates
WHERE currency_code != 'USD'
ORDER BY last_updated DESC;
```

If `last_updated` is more than 48 hours old, the cron job may not be running.

### View pg_cron Execution History

```sql
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'exchange-rates-daily')
ORDER BY start_time DESC
LIMIT 10;
```

### Check Edge Function Logs

View edge function logs in Supabase Dashboard:
https://supabase.com/dashboard/project/xsqdkubgyqwpyvfltnrf/functions/update-exchange-rates/logs

## Troubleshooting

### Cron Job Not Running

Check if pg_cron is enabled:
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```

### Authentication Errors

Verify the cron secret is set in the database:
```sql
SELECT name, created_at, updated_at FROM cron_secrets WHERE name = 'exchange_rates_cron';
```

Then check Supabase secrets:
```bash
supabase secrets list | grep EXCHANGE_RATES
```

The secret must match in both places.

### Stale Exchange Rates

If rates haven't updated in over 24 hours, manually trigger an update:

```sql
SELECT update_exchange_rates_cron();
```

Then check the `last_updated` timestamp:

```sql
SELECT currency_code, last_updated FROM exchange_rates ORDER BY last_updated;
```

### API Rate Limit

The free tier allows 1500 requests/month. With daily updates (30/month), we use only 2% of the quota.

If you see rate limit errors in the logs, consider:
1. Checking if multiple cron jobs are running (duplicate schedules)
2. Verifying the schedule is daily, not more frequent
3. Upgrading to a paid tier if needed (unlikely)

## Updating the Schedule

To change the schedule, run:

```sql
-- Unschedule old job
SELECT cron.unschedule('exchange-rates-daily');

-- Reschedule with new time (example: 6:00 AM UTC)
SELECT cron.schedule(
  'exchange-rates-daily',
  '0 6 * * *',
  $$SELECT update_exchange_rates_cron()$$
);
```

## Manual Rate Update

To manually update all exchange rates:

```sql
SELECT update_exchange_rates_cron();
```

## Adding New Currencies

To add a new currency (e.g., MXN - Mexican Peso):

1. **Update the edge function** (`supabase/functions/update-exchange-rates/index.ts`):
   ```typescript
   const currencies = ['CAD', 'AUD', 'NZD', 'EUR', 'GBP', 'THB', 'JPY', 'CNY', 'MXN'];
   ```

2. **Add the currency symbol** in the frontend (`EventDetail.jsx`):
   ```javascript
   const getCurrencySymbol = (currencyCode) => {
     const symbols = {
       'USD': '$', 'CAD': '$', 'AUD': '$', 'NZD': '$',
       'EUR': '€', 'GBP': '£', 'THB': '฿', 'JPY': '¥', 'CNY': '¥',
       'MXN': '$'  // Add new currency
     };
     return symbols[currencyCode] || '$';
   };
   ```

3. **Deploy the edge function**:
   ```bash
   supabase functions deploy update-exchange-rates
   ```

4. **Deploy the admin frontend**:
   ```bash
   cd /root/vote_app/vote26/art-battle-admin
   ./deploy.sh
   ```

5. **Trigger an update** to populate the new currency:
   ```sql
   SELECT update_exchange_rates_cron();
   ```
