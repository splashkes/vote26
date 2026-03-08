# Twilio Legacy SMS Integration

## Overview
This document describes how to configure your existing Twilio SMS system to send messages to the new SMS marketing system without losing any messages.

## Architecture
- **Legacy System**: Node app at `/root/vote_app/sms-vote` with Twilio integration
- **New System**: Telnyx + Supabase SMS marketing system at `/root/vote_app/vote26`
- **Bridge**: New Supabase Edge Function receives Twilio webhooks and stores them in the same `sms_inbound` table

## Edge Function Details

**Function Name**: `sms-twilio-webhook`
**URL**: `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/sms-twilio-webhook`
**Method**: POST
**Content-Type**: application/x-www-form-urlencoded (Twilio format)

## Twilio Configuration

### Step 1: Update Twilio Phone Number Webhook

1. Log into your Twilio Console: https://console.twilio.com/
2. Navigate to **Phone Numbers** → **Manage** → **Active Numbers**
3. Click on your SMS-enabled phone number
4. Scroll down to the **Messaging** section
5. Under **A MESSAGE COMES IN**, configure:
   - **Webhook URL**: `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/sms-twilio-webhook`
   - **HTTP Method**: `POST`
   - **Content Type**: Default (application/x-www-form-urlencoded)

6. Click **Save**

### Step 2: Test the Integration

Send a test SMS to your Twilio number and verify:

1. **Check the edge function logs**:
   ```bash
   cd /root/vote_app/vote26/supabase
   supabase functions logs sms-twilio-webhook --tail
   ```

2. **Check the database**:
   ```sql
   -- View recent inbound messages
   SELECT * FROM sms_inbound
   ORDER BY created_at DESC
   LIMIT 10;

   -- View webhook debug logs
   SELECT * FROM sms_webhook_debug
   WHERE processing_result LIKE '%twilio%'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

3. **Verify in Admin UI**:
   - Go to https://artb.tor1.cdn.digitaloceanspaces.com/admin/
   - Navigate to SMS Conversations
   - Check if the test message appears

## Data Mapping

The function maps Twilio webhook fields to the Supabase schema:

| Twilio Field | Supabase Column | Notes |
|-------------|----------------|-------|
| `MessageSid` or `SmsSid` | `telnyx_message_id` | Unique message identifier |
| `From` | `from_phone` | Sender phone number |
| `To` | `to_phone` | Recipient phone number |
| `Body` | `message_body` | Message text content |
| (calculated) | `character_count` | Length of message body |
| `NumMedia` | `telnyx_data.num_media` | Number of media attachments |
| (all fields) | `telnyx_data` | Full Twilio payload stored as JSON |

## Features

### Automatic Opt-Out Handling
The function automatically detects and handles opt-out keywords:
- **STOP, UNSUBSCRIBE, QUIT, CANCEL, END**: Sets `is_stop_request = true` and blocks the user in the `people` table
- **HELP, INFO, SUPPORT**: Sets `is_help_request = true` for tracking

### Debug Logging
All webhook requests are logged to `sms_webhook_debug` table for troubleshooting:
```sql
SELECT
  created_at,
  method,
  processing_result,
  error_message,
  body_parsed
FROM sms_webhook_debug
WHERE processing_result LIKE '%twilio%'
ORDER BY created_at DESC;
```

## Monitoring

### Check for Errors
```sql
SELECT * FROM sms_webhook_debug
WHERE processing_result = 'error'
  AND body_parsed->>'source' = 'twilio'
ORDER BY created_at DESC;
```

### Message Volume
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as messages,
  COUNT(CASE WHEN is_stop_request THEN 1 END) as stop_requests
FROM sms_inbound
WHERE telnyx_data->>'source' = 'twilio'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Troubleshooting

### Messages not appearing?
1. Check Twilio webhook configuration is correct
2. Check edge function logs for errors
3. Check `sms_webhook_debug` table for recent entries
4. Verify the webhook URL is reachable: `curl https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/sms-twilio-webhook`

### Duplicate messages?
- The function uses `telnyx_message_id` which stores Twilio's `MessageSid`
- Add a unique constraint if needed: `ALTER TABLE sms_inbound ADD CONSTRAINT unique_message_id UNIQUE (telnyx_message_id);`

### STOP requests not working?
- Verify the `people` table has records with matching phone numbers
- Check both `phone` and `phone_number` columns
- Review logs: `SELECT * FROM sms_inbound WHERE is_stop_request = true ORDER BY created_at DESC;`

## Migration Path

Once you've verified the Twilio webhook is working correctly:

1. **Keep Twilio active for 30 days** to ensure no messages are lost
2. **Monitor both systems** to ensure all messages appear in the admin UI
3. **Gradually transition** to Telnyx for outbound messages
4. **After 30 days**, you can safely disable the Twilio number

## Security Notes

- The edge function uses the Supabase service role key, not user authentication
- Consider adding Twilio signature validation for production (currently commented out)
- All webhook data is logged to `sms_webhook_debug` for audit purposes

## Files

- Edge Function: `/root/vote_app/vote26/supabase/functions/sms-twilio-webhook/index.ts`
- This Documentation: `/root/vote_app/vote26/TWILIO_LEGACY_SMS_SETUP.md`

## Support

For issues or questions, check:
1. Edge function logs: `supabase functions logs sms-twilio-webhook`
2. Webhook debug table: `SELECT * FROM sms_webhook_debug ORDER BY created_at DESC LIMIT 20;`
3. Twilio webhook logs in Twilio Console
