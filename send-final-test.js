// Send final test notification with proper formatting
const SUPABASE_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';

async function sendFinalTest() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/slack-webhook`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channel: 'C08QG87U3D0',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🎨 *Art Battle Notification System*'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'All systems operational! The following notifications are enabled:'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: ':ballot_box_with_ballot: *Voting*\nEvery 10 votes + milestones'
            },
            {
              type: 'mrkdwn',
              text: ':moneybag: *Bidding*\nBids over $100'
            },
            {
              type: 'mrkdwn',
              text: ':checkered_flag: *Rounds*\nCompletion alerts'
            },
            {
              type: 'mrkdwn',
              text: ':chart_with_upwards_trend: *Summaries*\nHourly reports'
            }
          ]
        },
        {
          type: 'divider'
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '_Ready for AB3032!_ • Powered by Art Battle Vote'
            }
          ]
        }
      ]
    })
  });

  const result = await response.json();
  console.log('Result:', result);
}

sendFinalTest().catch(console.error);