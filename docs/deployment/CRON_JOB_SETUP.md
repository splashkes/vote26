# Slack Queue Processing - Cron Job Setup

## Overview
The Slack notification system requires periodic processing to send queued notifications. This document provides multiple options for setting up automated processing.

## Option 1: GitHub Actions (Recommended)

### Setup Steps:

1. **Add Repository Secrets**
   - Go to your GitHub repository → Settings → Secrets and variables → Actions
   - Add new repository secret:
     - Name: `SUPABASE_ANON_KEY`
     - Value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U`

2. **Enable GitHub Actions**
   - Ensure Actions are enabled for your repository
   - The workflow file is already created at `.github/workflows/process-slack-queue.yml`

3. **Verify Workflow**
   - The workflow runs every 2 minutes
   - You can also trigger it manually from Actions tab

## Option 2: External Cron Service (cron-job.org)

### Setup Steps:

1. **Create Account** at https://cron-job.org

2. **Create New Cron Job**
   - **Title**: Art Battle Slack Queue Processor
   - **URL**: `https://xsqdkubgyqwpyvfltnrf.supabase.co/rest/v1/rpc/manual_process_slack_queue`
   - **Schedule**: Every 2 minutes (`*/2 * * * *`)
   - **Request Method**: POST
   - **Request Headers**:
     ```
     apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U
     Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U
     Content-Type: application/json
     ```
   - **Request Body**: `{}`

3. **Add Second Job for Auction Closing**
   - **Title**: Art Battle Auction Closing Check
   - **URL**: `https://xsqdkubgyqwpyvfltnrf.supabase.co/rest/v1/rpc/check_auction_closing`
   - Same headers as above
   - **Schedule**: Every 5 minutes (`*/5 * * * *`)

## Option 3: Vercel Cron Functions

### Setup Steps:

1. **Create `vercel.json`**:
```json
{
  "crons": [
    {
      "path": "/api/process-slack-queue",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

2. **Create API Route** at `api/process-slack-queue.js`:
```javascript
export default async function handler(req, res) {
  const SUPABASE_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    // Process queue
    const queueResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/manual_process_slack_queue`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });

    const result = await queueResponse.json();
    
    // Process notifications if any
    if (result.ready_to_send?.count > 0) {
      // Get notifications batch
      const batchResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/send_slack_notification_batch`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });

      const notifications = await batchResponse.json();
      
      // Send each notification
      for (const notification of notifications.notifications || []) {
        await fetch(`${SUPABASE_URL}/functions/v1/slack-webhook`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            channel: notification.channel,
            text: notification.text,
            blocks: notification.blocks
          })
        });
      }
    }

    res.status(200).json({ processed: true, result });
  } catch (error) {
    console.error('Error processing queue:', error);
    res.status(500).json({ error: error.message });
  }
}
```

3. **Set Environment Variable** in Vercel dashboard

## Option 4: Simple Node.js Cron Script

### For Development/Testing:

1. **Install Dependencies**:
```bash
npm install node-cron node-fetch
```

2. **Create `slack-queue-processor.js`**:
```javascript
const cron = require('node-cron');
const fetch = require('node-fetch');

const SUPABASE_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';

async function processQueue() {
  console.log('Processing Slack queue...', new Date().toISOString());
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/manual_process_slack_queue`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });

    const result = await response.json();
    console.log('Queue processed:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run every 2 minutes
cron.schedule('*/2 * * * *', processQueue);

console.log('Slack queue processor started...');
```

3. **Run with PM2** (for production):
```bash
npm install -g pm2
pm2 start slack-queue-processor.js
pm2 save
pm2 startup
```

## Monitoring

### Check Queue Status:
```sql
SELECT get_slack_queue_status();
```

### View Recent Notifications:
```sql
SELECT * FROM slack_notifications 
ORDER BY created_at DESC 
LIMIT 20;
```

### Check Failed Notifications:
```sql
SELECT * FROM slack_notifications 
WHERE status = 'failed' 
ORDER BY created_at DESC;
```

### Analytics:
```sql
SELECT 
  notification_type,
  sent_count,
  failed_count,
  last_sent_at
FROM slack_analytics
WHERE event_id = (SELECT id FROM events WHERE eid = 'AB3032');
```

## Troubleshooting

### Notifications Not Being Sent:
1. Check if cron job is running
2. Verify queue has pending notifications
3. Check for failed notifications and errors
4. Ensure Slack channel IDs are correct

### Rate Limiting:
- Current setup processes max 10 notifications per batch
- Runs every 2 minutes = max 300 notifications/hour
- Adjust frequency if needed

### Channel Not Found:
- Verify channel mapping in `slack_channels` table
- Ensure bot is in the channel
- Use `add_slack_channel()` to add new mappings

## Testing

### Manual Queue Processing:
```bash
curl -X POST https://xsqdkubgyqwpyvfltnrf.supabase.co/rest/v1/rpc/manual_process_slack_queue \
  -H "apikey: your-anon-key" \
  -H "Authorization: Bearer your-anon-key" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Simulate Activity:
```sql
-- Generate test notifications
SELECT simulate_voting_activity(10);
SELECT simulate_bidding_activity(5, 200);
```