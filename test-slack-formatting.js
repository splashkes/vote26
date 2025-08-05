// Test improved Slack formatting
const SUPABASE_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';

async function testSlackFormatting() {
  // Test with properly formatted message using blocks
  const response = await fetch(`${SUPABASE_URL}/functions/v1/slack-webhook`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channel: 'C08QG87U3D0',
      text: 'Art Battle Slack Integration Test',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🎨 Art Battle Slack Integration',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':white_check_mark: *System Status: Operational*'
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Notification Types Enabled:*'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: ':ballot_box_with_ballot: *Voting*\nEvery 10 votes'
            },
            {
              type: 'mrkdwn',
              text: ':moneybag: *Bidding*\n$100+ threshold'
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
              text: 'Powered by Art Battle Vote System | Event: AB3032'
            }
          ]
        }
      ]
    })
  });

  const result = await response.json();
  console.log('Slack response:', result);
}

testSlackFormatting().catch(console.error);