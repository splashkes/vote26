# Slack Integration Developer Guide

## Overview
This guide provides comprehensive documentation for maintaining and expanding the Art Battle Vote Slack integration. It includes technical details, best practices, and lessons learned during implementation.

## Architecture Components

### 1. Database Layer

#### Core Tables
- **`slack_notifications`** - Queue for all outgoing messages
- **`event_slack_settings`** - Per-event configuration
- **`slack_templates`** - Reusable message templates (for future use)
- **`slack_analytics`** - Tracking and metrics

#### Key Functions
- **`format_slack_message()`** - Converts notification data into Slack blocks
- **`queue_vote_notification()`** - Trigger function for vote events
- **`queue_bid_notification()`** - Trigger function for bid events
- **`send_slack_notification_batch()`** - Retrieves pending notifications
- **`manual_process_slack_queue()`** - Processes notification queue

### 2. Edge Function Layer

#### slack-webhook Function
Location: `/supabase/functions/slack-webhook/index.ts`

Responsibilities:
- Receives formatted messages from database
- Authenticates with Slack API
- Handles newline character conversion
- Returns success/failure status

### 3. Processing Flow

```
Event Occurs → Database Trigger → Queue Notification → Format Message → Edge Function → Slack API
                                         ↓
                                  slack_notifications
                                    (queue table)
```

## Adding New Notification Types

### Step 1: Define the Notification Type

Add a new case to the `format_slack_message()` function:

```sql
-- In format_slack_message() function
WHEN 'your_new_type' THEN
  RETURN jsonb_build_array(
    jsonb_build_object(
      'type', 'section',
      'text', jsonb_build_object(
        'type', 'mrkdwn',
        'text', format(E':your_emoji: *Your Title*\nDetail 1: %s\nDetail 2: %s',
          p_payload->>'field1',
          p_payload->>'field2'
        )
      )
    )
  );
```

### Step 2: Create the Trigger Function

```sql
CREATE OR REPLACE FUNCTION queue_your_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_event_settings RECORD;
  v_event_id UUID;
BEGIN
  -- Get event settings
  SELECT * INTO v_event_settings
  FROM event_slack_settings
  WHERE event_id = NEW.event_id;
  
  -- Check if notifications are enabled
  IF v_event_settings.your_notifications AND v_event_settings.channel_id IS NOT NULL THEN
    -- Queue the notification
    INSERT INTO slack_notifications (
      event_id,
      channel_id,
      message_type,
      payload
    ) VALUES (
      NEW.event_id,
      v_event_settings.channel_id,
      'your_new_type',
      jsonb_build_object(
        'field1', NEW.some_field,
        'field2', NEW.another_field,
        -- Include all data needed for formatting
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Step 3: Create the Database Trigger

```sql
CREATE TRIGGER after_your_event
AFTER INSERT OR UPDATE ON your_table
FOR EACH ROW
EXECUTE FUNCTION queue_your_notification();
```

### Step 4: Add Configuration Field

```sql
ALTER TABLE event_slack_settings 
ADD COLUMN your_notifications BOOLEAN DEFAULT true;
```

## Slack Message Formatting Best Practices

### ✅ CORRECT Approaches

#### 1. Use Blocks API for Rich Formatting
```javascript
blocks: [
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: 'Your *formatted* text here'
    }
  }
]
```

#### 2. Use PostgreSQL E-strings for Escape Sequences
```sql
-- CORRECT: E-string notation preserves newlines
format(E'Line 1\nLine 2\nLine 3', ...)

-- WRONG: Regular strings escape the backslash
format('Line 1\\nLine 2\\nLine 3', ...)
```

#### 3. Use Slack Emoji Shortcodes
```sql
-- CORRECT: Slack shortcodes
':fire: Hot item!'
':white_check_mark: Complete'

-- WRONG: Unicode emoji (may not render consistently)
'🔥 Hot item!'
'✅ Complete'
```

#### 4. Structure Complex Messages with Multiple Blocks
```javascript
blocks: [
  { type: 'header', text: { type: 'plain_text', text: 'Title' }},
  { type: 'section', text: { type: 'mrkdwn', text: 'Content' }},
  { type: 'divider' },
  { type: 'section', fields: [/* field array */] },
  { type: 'context', elements: [/* footer elements */] }
]
```

### ❌ INCORRECT Approaches & Pitfalls

#### 1. Double-Escaping Newlines
```sql
-- WRONG: This will show \n in Slack
payload->>'message' -- when message contains '\\n'

-- CORRECT: Single escape or E-string
E'Line 1\nLine 2'
```

#### 2. Using Only Text Field
```javascript
// WRONG: Limited formatting options
{
  channel: 'channel',
  text: 'Simple text only'
}

// CORRECT: Use blocks for rich formatting
{
  channel: 'channel',
  text: 'Fallback text',
  blocks: [/* rich content */]
}
```

#### 3. Missing Text Fallback
```javascript
// WRONG: No fallback for notifications
{
  channel: 'channel',
  blocks: [/* blocks */]
}

// CORRECT: Always include text fallback
{
  channel: 'channel',
  text: 'Notification summary',
  blocks: [/* blocks */]
}
```

#### 4. Incorrect JSON Syntax in SQL
```sql
-- WRONG: Colon in wrong place
jsonb_build_object('type': 'divider')

-- CORRECT: Comma-separated key-value pairs
jsonb_build_object('type', 'divider')
```

## Common Pitfalls & Solutions

### 1. Notification Not Sending

**Problem**: Notifications stuck in pending state

**Check**:
```sql
-- Check notification status
SELECT id, status, attempts, last_attempt_at, error 
FROM slack_notifications 
WHERE status = 'pending' 
ORDER BY created_at DESC;

-- Check if formatted
SELECT id, payload ? 'formatted_blocks' as has_blocks
FROM slack_notifications
WHERE status = 'pending';
```

**Solution**:
- Ensure `manual_process_slack_queue()` is being called
- Check `last_attempt_at` - must be NULL or > 1 minute ago
- Verify notification has `formatted_blocks` in payload

### 2. Channel Not Found Error

**Problem**: Slack API returns `channel_not_found`

**Solutions**:
1. Use channel ID (C1234567890) not channel name
2. Ensure bot is invited to the channel
3. For private channels, bot needs explicit invitation

**Get Channel ID**:
- Right-click channel in Slack → View channel details
- Channel ID starts with 'C' for public, 'G' for private

### 3. Formatting Issues

**Problem**: Text shows `\n` instead of line breaks

**Solution**: Use E-strings in PostgreSQL:
```sql
-- In trigger functions
E'Line 1\nLine 2'  -- Correct
'Line 1\\nLine 2'  -- Wrong

-- In Edge Function (already handled)
text.replace(/\\n/g, '\n')
```

### 4. Rate Limiting

**Problem**: Too many notifications overwhelming Slack

**Solutions**:
1. Batch notifications (current: every 10 votes)
2. Use threshold settings
3. Implement time-based grouping
4. Queue processing limits (10 per batch)

### 5. Missing Notifications

**Problem**: Expected notification not created

**Debug Steps**:
```sql
-- Check if trigger fired
SELECT COUNT(*) FROM votes WHERE event_id = 'your-event-id';

-- Check event settings
SELECT * FROM event_slack_settings WHERE event_id = 'your-event-id';

-- Check recent notifications
SELECT * FROM slack_notifications 
WHERE event_id = 'your-event-id' 
ORDER BY created_at DESC;
```

## Testing Notifications

### 1. Direct Test
```sql
SELECT send_test_slack_notification('test', E'Your test message\nWith newlines');
```

### 2. Simulate Events
```sql
-- Simulate votes
SELECT simulate_voting_activity(5);

-- Simulate bids
SELECT simulate_bidding_activity(3, 100);
```

### 3. Manual Processing
```sql
-- Process queue
SELECT manual_process_slack_queue();

-- Check status
SELECT get_slack_queue_status();
```

### 4. Direct Edge Function Test
```javascript
// Use the test scripts in the repo
node send-final-test.js
```

## Environment Variables & Secrets

### Required Secrets (set via Supabase CLI)
```bash
supabase secrets set \
  SLACK_BOT_TOKEN=xoxb-... \
  SLACK_SIGNING_SECRET=... \
  SLACK_APP_TOKEN=xapp-...
```

### Accessing in Edge Function
```typescript
const slackToken = Deno.env.get('SLACK_BOT_TOKEN')
```

## Monitoring & Debugging

### Check Queue Health
```sql
-- Queue status
SELECT get_slack_queue_status();

-- Failed notifications
SELECT * FROM slack_notifications 
WHERE status = 'failed' 
ORDER BY created_at DESC;

-- Analytics
SELECT * FROM slack_analytics 
WHERE event_id = 'your-event-id';
```

### View Edge Function Logs
1. Supabase Dashboard → Functions → slack-webhook → Logs
2. Check for authentication errors
3. Verify Slack API responses

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `channel_not_found` | Invalid channel ID or bot not in channel | Use correct channel ID, invite bot |
| `not_in_channel` | Bot not a member of private channel | Invite bot to channel |
| `invalid_auth` | Bad token | Check SLACK_BOT_TOKEN secret |
| `missing_scope` | Bot lacks permissions | Add required OAuth scopes |
| `rate_limited` | Too many requests | Implement backoff, reduce frequency |

## Performance Optimization

### 1. Batch Processing
Current implementation processes 10 notifications per batch to avoid rate limits.

### 2. Indexing
Key indexes already in place:
- `idx_slack_notifications_pending` on status and created_at
- `idx_slack_analytics_event_type` for analytics queries

### 3. Queue Cleanup
```sql
-- Archive old notifications
DELETE FROM slack_notifications 
WHERE created_at < NOW() - INTERVAL '30 days'
AND status IN ('sent', 'failed');
```

## Security Considerations

### 1. No PII in Notifications
- Use IDs not names
- Aggregate data only
- No personal information

### 2. Channel Access Control
- Validate channel IDs
- Use per-event settings
- Audit trail in slack_analytics

### 3. Rate Limiting
- Built into queue processor
- Configurable thresholds
- Retry logic with backoff

## Future Enhancement Ideas

### 1. Template System
```sql
-- Use slack_templates table for reusable formats
INSERT INTO slack_templates (name, template_type, blocks)
VALUES ('vote_summary', 'summary', '{"blocks": [...]}'::jsonb);
```

### 2. Scheduled Summaries
```sql
-- Add to event_slack_settings
ALTER TABLE event_slack_settings
ADD COLUMN summary_schedule JSONB DEFAULT '{"daily": "09:00", "weekly": "monday"}'::jsonb;
```

### 3. Interactive Messages
Add button actions for:
- Acknowledging alerts
- Triggering reports
- Quick actions

### 4. Multi-Channel Support
```sql
-- Support multiple channels per event
CREATE TABLE event_slack_channels (
  event_id UUID,
  channel_id VARCHAR(100),
  notification_types TEXT[]
);
```

## Deployment Checklist

When deploying changes:

- [ ] Test formatting in SQL with E-strings
- [ ] Update Edge Function if needed
- [ ] Run migrations in order
- [ ] Test with `send_test_slack_notification()`
- [ ] Verify in target Slack channel
- [ ] Update this documentation
- [ ] Check queue processing
- [ ] Monitor for errors

## Support Resources

### Slack API Documentation
- [Block Kit Builder](https://app.slack.com/block-kit-builder)
- [Message Formatting](https://api.slack.com/reference/surfaces/formatting)
- [API Methods](https://api.slack.com/methods)

### Supabase Documentation
- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Database Functions](https://supabase.com/docs/guides/database/functions)
- [Realtime/Triggers](https://supabase.com/docs/guides/database/postgres/triggers)

### Internal Resources
- Test Event: TEST123
- Test Channel: C08QG87U3D0
- Production Event: AB3032