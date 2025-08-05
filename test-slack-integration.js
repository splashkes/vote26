// Test script to send Slack notifications via Edge Function
// Run this with Node.js to test the integration

const SUPABASE_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';

async function processSlackQueue() {
  try {
    // Get pending notifications
    const queueResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/send_slack_notification_batch`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const queueData = await queueResponse.json();
    console.log('Queue data:', queueData);

    // Handle both direct response and nested response
    const notifications = queueData.notifications || [];
    
    if (!notifications || notifications.length === 0) {
      console.log('No notifications to send');
      return;
    }

    // Send each notification
    const successIds = [];
    
    for (const notification of notifications) {
      try {
        console.log(`Sending notification ${notification.id} to channel ${notification.channel}`);
        
        const response = await fetch(`${SUPABASE_URL}/functions/v1/slack-webhook`, {
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

        const result = await response.json();
        
        if (response.ok && result.success) {
          console.log(`✓ Notification sent successfully: ${notification.id}`);
          successIds.push(notification.id);
        } else {
          console.error(`✗ Failed to send notification ${notification.id}:`, result);
          
          // Mark as failed
          await fetch(`${SUPABASE_URL}/rest/v1/rpc/mark_notification_failed`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              p_notification_id: notification.id,
              p_error: result.error || 'Unknown error'
            })
          });
        }
      } catch (error) {
        console.error(`Error sending notification ${notification.id}:`, error);
      }
    }

    // Mark successful notifications as sent
    if (successIds.length > 0) {
      const markResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/mark_notifications_sent`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_notification_ids: successIds
        })
      });

      const markResult = await markResponse.json();
      console.log(`Marked ${markResult} notifications as sent`);
    }

    // Check final status
    const statusResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_slack_queue_status`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const status = await statusResponse.json();
    console.log('Final queue status:', status);

  } catch (error) {
    console.error('Error processing Slack queue:', error);
  }
}

// Run the processor
console.log('Processing Slack notification queue...');
processSlackQueue();