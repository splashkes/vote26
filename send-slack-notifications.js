// Direct script to send Slack notifications
const SUPABASE_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';

async function sendSlackNotifications() {
  // Get pending notifications directly
  const response = await fetch(`${SUPABASE_URL}/functions/v1/slack-webhook`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channel: 'C08QG87U3D0',
      text: '✅ Art Battle Slack Integration Test',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '✅ *Art Battle Slack Integration is Working!*\\n\\n*Voting Notifications*: Ready ✓\\n*Bid Notifications*: Ready ✓\\n*Round Updates*: Ready ✓\\n\\nThe system will now send real-time updates for:\\n• New votes (every 10 votes)\\n• Voting milestones (100, 500, 1000)\\n• New bids above threshold\\n• Round completions\\n• Hourly summaries'
          }
        }
      ]
    })
  });

  const result = await response.json();
  console.log('Slack response:', result);
}

sendSlackNotifications().catch(console.error);