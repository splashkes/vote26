# Slack Integration Deployment Guide

## Overview
This guide walks through deploying the Slack integration for the Art Battle Vote system. The integration sends real-time notifications for voting, bidding, and event activities to designated Slack channels.

## Prerequisites
- Supabase project with service role access
- Slack workspace with bot app configured
- Access to Supabase dashboard for secrets management

## Deployment Steps

### 1. Store Slack Credentials in Supabase Vault

Navigate to your Supabase project dashboard and add the following secrets:

1. Go to **Settings** → **Vault**
2. Add the following secrets:
   ```
   Name: SLACK_BOT_TOKEN
   Value: REDACTED_SLACK_BOT_TOKEN
   
   Name: SLACK_SIGNING_SECRET
   Value: REDACTED_SLACK_SIGNING_SECRET
   
   Name: SLACK_APP_TOKEN
   Value: REDACTED_SLACK_APP_TOKEN
   ```

### 2. Run Database Migrations

Execute the migrations in order using the Supabase SQL command:

```bash
# 1. Create base schema
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/20250804_slack_integration.sql

# 2. Add queue processor
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/20250804_slack_queue_processor.sql

# 3. Add summary functions
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/20250804_slack_summaries.sql

# 4. Add test functions (optional)
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/20250804_slack_test_setup.sql
```

### 3. Deploy Edge Function

Deploy the Slack webhook Edge Function:

```bash
# From the project root
supabase functions deploy slack-webhook
```

### 4. Configure Events for Slack

For each event that should send Slack notifications:

1. Get your Slack channel ID (right-click channel → View channel details)
2. Insert configuration:

```sql
-- Replace with your actual event_id and channel_id
INSERT INTO event_slack_settings (
  event_id,
  channel_id,
  vote_notifications,
  bid_notifications,
  round_notifications,
  threshold_settings
) VALUES (
  (SELECT id FROM events WHERE eid = 'AB3032'),
  'C07RB3ML3CU', -- Your Slack channel ID
  true,
  true,
  true,
  '{"min_bid_amount": 100}'::jsonb
);
```

### 5. Set Up Queue Processing

Since Supabase doesn't have built-in cron, you have several options:

#### Option A: External Cron Service
Use a service like cron-job.org or EasyCron to call:
```
POST https://your-project.supabase.co/rest/v1/rpc/manual_process_slack_queue
Headers:
  apikey: your-anon-key
  Authorization: Bearer your-anon-key
```

#### Option B: GitHub Actions
Create `.github/workflows/slack-queue.yml`:
```yaml
name: Process Slack Queue
on:
  schedule:
    - cron: '*/5 * * * *' # Every 5 minutes
jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - name: Process Queue
        run: |
          curl -X POST \
            https://your-project.supabase.co/rest/v1/rpc/manual_process_slack_queue \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

#### Option C: Vercel/Netlify Functions
Create a scheduled function that calls the queue processor.

### 6. Test the Integration

Run the test flow to verify everything is working:

```sql
-- Send a test notification
SELECT send_test_slack_notification('test', '🎉 Slack integration is working!');

-- Run full integration test
SELECT test_slack_integration_flow();

-- Check queue status
SELECT get_slack_queue_status();
```

## Notification Types

The system will automatically send notifications for:

1. **Voting Updates**
   - Every 10th vote on an artwork
   - Milestone votes (100, 500, 1000, 5000)

2. **Bid Notifications**
   - New bids above threshold (configurable per event)
   - High-value bids (> $1000) get special formatting

3. **Round Completion**
   - Announces round winner and vote count

4. **Hourly Summaries**
   - Current voting leaders
   - Auction statistics
   - Event metrics

## Monitoring

Check system health:

```sql
-- View recent notifications
SELECT * FROM slack_notifications 
ORDER BY created_at DESC 
LIMIT 20;

-- Check failed notifications
SELECT * FROM slack_notifications 
WHERE status = 'failed' 
ORDER BY created_at DESC;

-- View analytics
SELECT * FROM slack_analytics 
WHERE event_id = (SELECT id FROM events WHERE eid = 'AB3032');
```

## Troubleshooting

### Notifications not sending
1. Check Slack credentials in vault
2. Verify channel ID is correct
3. Check Edge Function logs in Supabase dashboard
4. Ensure queue processor is running

### Missing notifications
1. Verify event has Slack settings configured
2. Check notification type is enabled
3. Review threshold settings

### Rate limiting
- The system queues notifications to avoid Slack rate limits
- Adjust batch size in `process_slack_queue()` if needed

## Maintenance

### Update Slack channel for an event
```sql
UPDATE event_slack_settings 
SET channel_id = 'NEW_CHANNEL_ID'
WHERE event_id = (SELECT id FROM events WHERE eid = 'AB3032');
```

### Disable notifications temporarily
```sql
UPDATE event_slack_settings 
SET vote_notifications = false,
    bid_notifications = false,
    round_notifications = false
WHERE event_id = (SELECT id FROM events WHERE eid = 'AB3032');
```

### Clear old notifications
```sql
DELETE FROM slack_notifications 
WHERE created_at < NOW() - INTERVAL '30 days'
AND status IN ('sent', 'failed');
```

## Security Notes

- Slack credentials are stored encrypted in Supabase Vault
- Edge Functions use service role key for vault access
- All notifications are queued and processed asynchronously
- No PII is sent to Slack (only IDs and aggregate data)