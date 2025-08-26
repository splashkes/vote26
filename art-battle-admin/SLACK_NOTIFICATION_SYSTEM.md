# Art Battle Slack Notification System
## Complete Integration Guide

**Date:** August 25, 2025  
**Status:** Production Ready ✅  
**Auto-Processing:** Every minute (20 messages/batch)

---

## 🎯 System Overview

A robust, queue-based Slack notification system that automatically delivers notifications to event-specific channels with real-time channel lookup, secure token management, and graceful fallbacks.

### ✅ **What's Working:**
- **Admin Invitations & Confirmations** → #general  
- **Artist Applications, Invitations & Confirmations** → Event-specific channels
- **Real-time Channel Lookup** (no cache dependencies)
- **Automated Queue Processing** (20 messages/minute via cron)
- **Secure Token Management** (vault storage)
- **Graceful Fallbacks** (unknown channels → #general)

---

## 🏗️ Architecture

### **Core Components:**

1. **Queue System** (`slack_notifications` table)
2. **Channel Resolution** (`resolve_slack_channel()` function) 
3. **Message Processing** (`process_slack_notification()` function)
4. **Batch Processing** (`process_slack_queue_batch()` function)
5. **Automated Cron** (runs every minute)

### **Flow:**
```
Application/Invitation/Confirmation 
    ↓
Queue Notification (with channel name)
    ↓  
Real-time Channel Lookup (Slack API)
    ↓
Queue Processing (every minute, 20 msgs)
    ↓
Delivery to Slack Channel
```

---

## 🔧 How to Queue Notifications

### **Simple Queue Function:**
```sql
SELECT queue_slack_notification(
    p_channel_name TEXT,      -- 'toronto', 'general', 'artist-notify'
    p_message_type TEXT,      -- 'admin_invitation', 'artist_application', etc.
    p_text TEXT,              -- Plain text message
    p_blocks JSONB DEFAULT NULL,  -- Rich Slack blocks (optional)
    p_event_id UUID DEFAULT NULL -- Event association (optional)
) RETURNS UUID; -- Returns notification_id
```

### **Examples:**

#### **Basic Text Message:**
```sql
SELECT queue_slack_notification(
    'toronto',
    'custom_notification', 
    'New artist application for Toronto event!'
);
```

#### **Rich Message with Blocks:**
```sql
SELECT queue_slack_notification(
    'montreal',
    'event_update',
    'Event Update: Montreal Art Battle',
    jsonb_build_array(
        jsonb_build_object(
            'type', 'section',
            'text', jsonb_build_object(
                'type', 'mrkdwn',
                'text', ':art: *Event Update*\n\nMontreal Art Battle has been updated!'
            )
        )
    )
);
```

---

## 🎨 Current Integrations

### **1. Admin System:**
- **Invitations**: `send_admin_invitation_slack()` → #general
- **Confirmations**: `send_admin_confirmation_slack()` → #general
- **Trigger**: Edge Functions (`admin-improved-invite`, `admin-activate-confirmed-users`)

### **2. Artist System:**
- **Applications**: Database trigger on `artist_applications` table
- **Invitations**: Database trigger on `artist_invitations` table  
- **Confirmations**: Database trigger on `artist_confirmations` table
- **Channel Routing**: Uses `events.slack_channel` field or falls back to #artist-notify

### **3. Event-Specific Routing:**
The system checks `events.slack_channel` and handles multiple formats:
- **Channel names**: `#toronto`, `montreal`, `nyc`
- **Webhook URLs**: Converted to `general` (legacy support)
- **Empty/null**: Falls back to `#artist-notify` for artists, `#general` for admin

---

## 🛠️ Channel Resolution

### **Real-time Lookup System:**
- ✅ **No caching** (eliminates stale data issues)
- ✅ **Handles pagination** (searches all Slack channels)  
- ✅ **Secure vault tokens** (no hardcoded credentials)
- ✅ **Graceful fallbacks** (#general if channel not found)

### **Supported Channel Formats:**
```sql
-- All of these work:
SELECT resolve_slack_channel('toronto');      -- Returns: C0LSPJ4RG
SELECT resolve_slack_channel('#montreal');    -- Returns: C2WGFQ9V0  
SELECT resolve_slack_channel('C0337E73W');    -- Returns: C0337E73W (passthrough)
SELECT resolve_slack_channel('nonexistent');  -- Returns: C0337E73W (fallback to #general)
```

---

## ⚙️ Queue Processing

### **Automated Processing:**
- **Frequency**: Every minute via pg_cron
- **Batch Size**: 20 messages per minute (respects Slack rate limits)
- **Rate Limiting**: 2-second delays every 5 messages
- **Error Handling**: Failed messages marked as 'failed' with error details

### **Manual Processing:**
```sql
-- Process specific number of notifications
SELECT process_slack_queue_batch(20);

-- Check queue status  
SELECT get_detailed_slack_queue_status();
```

### **Cron Jobs Running:**
1. **`process-slack-queue-every-minute`**: Processes 20 notifications every minute
2. **`cleanup-old-slack-notifications`**: Cleans up old notifications weekly (Sundays 2 AM)
3. **`monitor-slack-queue`**: Logs alerts if queue gets backed up (every 5 minutes)

---

## 📊 Monitoring & Troubleshooting

### **Queue Status:**
```sql
SELECT get_detailed_slack_queue_status();
-- Returns: pending, sent, failed counts, recent activity, etc.
```

### **Recent Notifications:**
```sql
SELECT 
    message_type, 
    status, 
    channel_id,
    payload->>'text' as message,
    created_at,
    sent_at,
    error
FROM slack_notifications 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### **Failed Notifications:**
```sql
SELECT 
    id,
    message_type,
    error,
    attempts,
    payload->>'text' as message
FROM slack_notifications 
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🔒 Security & Tokens

### **Token Management:**
- **Secure Storage**: Slack token stored in Supabase Vault
- **Access**: Functions use `vault.decrypted_secrets` table
- **No Hardcoding**: All hardcoded tokens removed from functions

### **Token Usage:**
```sql
-- Token is automatically retrieved in functions:
SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'slack_token';
```

---

## 🚀 Integration Examples

### **For New Systems:**

#### **Option 1: Direct Queue (Recommended):**
```typescript
// In your TypeScript/Edge Function:
const { data, error } = await supabase.rpc('queue_slack_notification', {
  p_channel_name: 'toronto',
  p_message_type: 'new_feature',
  p_text: 'New feature deployed!',
  p_blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ':rocket: *Feature Deployed*\n\nNew bidding system is now live!'
      }
    }
  ]
});
```

#### **Option 2: Database Trigger:**
```sql
-- Create trigger function for your table
CREATE OR REPLACE FUNCTION notify_your_feature_slack()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    SELECT queue_slack_notification(
        'general',
        'your_feature_notification',
        'Your feature: ' || NEW.name || ' was created!'
    );
    
    RETURN NEW;
END;
$$;

-- Attach trigger
CREATE TRIGGER your_feature_slack_notification
    AFTER INSERT ON your_table
    FOR EACH ROW EXECUTE FUNCTION notify_your_feature_slack();
```

---

## 📈 Performance & Limits

### **Rate Limits:**
- **Slack API**: ~20 requests/minute (Tier 2)
- **Our Processing**: 20 messages/minute with 2s delays every 5 messages
- **Queue Capacity**: Unlimited (PostgreSQL table)

### **Reliability:**
- **Retry Logic**: Failed messages can be manually reprocessed
- **Error Tracking**: All failures logged with specific error messages
- **Fallback Channels**: Unknown channels automatically route to #general
- **Atomic Processing**: Each message processed independently

---

## 🛠️ Maintenance

### **Regular Tasks:**
- ✅ **Automated**: Old notifications cleaned up weekly
- ✅ **Automated**: Queue monitoring every 5 minutes  
- ✅ **Automated**: Message processing every minute

### **Manual Checks:**
```sql
-- Weekly queue health check
SELECT get_detailed_slack_queue_status();

-- Clear very old notifications (manual, if needed)
SELECT cleanup_old_slack_notifications(30); -- 30 days
```

---

## 🔄 System Status

**Last Updated**: August 25, 2025  
**Queue Status**: ✅ Clear (0 pending)  
**Cron Status**: ✅ Running (every minute)  
**Token Status**: ✅ Valid (vault secured)  
**Channel Lookup**: ✅ Real-time API (no cache)  

**Ready for Production** ✅