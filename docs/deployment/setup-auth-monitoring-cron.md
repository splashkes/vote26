# Auth Monitoring Cron Job Setup

## Overview
This sets up a 5-minute cron job that monitors authentication activity and posts reports to #profile-debug in Slack.

## Deployment Steps

### 1. Deploy the Edge Function
```bash
cd /root/vote_app/vote26
npx supabase functions deploy auth-monitor-cron
```

### 2. Set up Cron Job (GitHub Actions or External Service)

#### Option A: GitHub Actions (Recommended)
Create `.github/workflows/auth-monitor-cron.yml`:

```yaml
name: Auth Monitor Cron
on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes
  workflow_dispatch:  # Allow manual trigger

jobs:
  monitor-auth:
    runs-on: ubuntu-latest
    steps:
      - name: Call Auth Monitor
        run: |
          curl -X POST \
            "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/auth-monitor-cron" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"source": "github_actions"}'
```

#### Option B: External Cron Service (cron-job.org, etc.)
Set up a cron job that hits:
```
POST https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/auth-monitor-cron
Authorization: Bearer [SERVICE_ROLE_KEY]
Content-Type: application/json
Body: {"source": "external_cron"}
```

#### Option C: Supabase Database Function + pg_cron (If available)
```sql
-- Only if pg_cron extension is available
SELECT cron.schedule(
  'auth-monitor-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/auth-monitor-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"source": "pg_cron"}'::jsonb
  );
  $$
);
```

### 3. Test the Function
```bash
# Test manually
curl -X POST \
  "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/auth-monitor-cron" \
  -H "Authorization: Bearer $(grep SUPABASE_SERVICE_ROLE_KEY .env | cut -d'=' -f2)" \
  -H "Content-Type: application/json" \
  -d '{"source": "manual_test"}'
```

## What It Monitors

### ✅ Successful Logins
- Users who completed phone verification in the last 5 minutes
- Grouped by country for easy reading
- Shows count per country (🇺🇸🇨🇦 US/Canada: 3, 🇹🇭 Thailand: 2, etc.)

### ❌ Failed Attempts
- Users who registered but didn't confirm their phone
- Shows masked phone numbers and time since attempt
- Limited to 5 recent failures (with count of additional ones)

### 🚨 Auth Errors
- Errors from auth_logs (if accessible)
- Shows unique error messages
- Includes SMS/OTP/Twilio related errors

### 📞 Phone Format Issues
- Invalid phone number formats in new registrations
- Double plus prefixes, wrong lengths, etc.

### 💚💛❤️ Health Indicator
- Success rate percentage with color coding:
  - 💚 ≥80% (Healthy)
  - 💛 60-79% (Concerning) 
  - ❤️ <60% (Critical)

## Sample Slack Message
```
🔐 **Auth Activity Report** (Last 5 minutes)
Time: 2025-08-28T15:30:00.000Z

✅ **3 Successful Logins**
   🇺🇸🇨🇦 US/Canada: 2
   🇹🇭 Thailand: 1

❌ **2 Failed Attempts**
   📱 +66***9592 (2m ago)
   📱 +14***4612 (4m ago)

💚 Success Rate: 60.0% (Healthy)
```

## Configuration Options

### Adjust Monitoring Frequency
Change the cron schedule:
- `*/5 * * * *` = Every 5 minutes
- `*/10 * * * *` = Every 10 minutes  
- `0 * * * *` = Every hour

### Customize Slack Channel
Edit the function to change the channel:
```typescript
channel: 'profile-debug',  // Change to your preferred channel
```

### Adjust Activity Thresholds
Modify the function to change what constitutes "activity":
- Currently posts if ANY successes OR failures occur
- Could add minimum thresholds (e.g., only post if >10 events)

## Monitoring the Monitor

The cron job itself will post errors to Slack if it fails, so you'll know if the monitoring breaks.

## Security Notes

- Uses SERVICE_ROLE_KEY (keep secure)
- No JWT verification needed (internal cron job)
- Masks phone numbers in Slack messages for privacy
- Only shows aggregated data, not personal details