# Supabase-Slack Integration Plan for Art Battle Vote System

## Overview
This document outlines the plan for implementing an extensible Slack notification system triggered by Supabase database events. The system will handle various notifications including voting updates, auction bid alerts, and administrative actions.

## Current Infrastructure Analysis

### Existing Assets
1. **Database Structure**
   - `events` table has `slack_channel` field (varchar(100)) ready for Slack channel IDs
   - Comprehensive tracking: votes, bids, art, round_contestants tables
   - Existing trigger infrastructure (e.g., `sync_round_contestants_to_art`)
   - Rich event and user data available for notifications

2. **Slack App**
   - Slack app already set up with bot functions
   - API keys available
   - Existing slash commands to be reproduced

3. **Technology Stack**
   - Supabase (PostgreSQL + Edge Functions)
   - React frontend
   - Environment variable system established

## Implementation Architecture

### Core Components

#### 1. Supabase Edge Functions
Create edge functions to handle Slack API communication:
```
supabase/functions/
├── slack-webhook/          # Main webhook handler
├── slack-formatter/        # Message formatting utilities
└── slack-commands/         # Slash command handlers
```

#### 2. Database Layer
- PostgreSQL functions for notification logic
- Notification queue table for reliability
- Audit logging for all Slack messages

#### 3. Trigger System
Database triggers on key tables:
- `votes` - Real-time voting updates
- `bids` - Auction activity
- `round_contestants` - Competition updates
- `art` - Artwork status changes

## Detailed Implementation Plan

### Phase 1: Foundation (Week 1)

#### 1.1 Environment Setup
```bash
# Add to .env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_ID=your-app-id
```

#### 1.2 Database Schema
```sql
-- Notification queue table
CREATE TABLE slack_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id),
  channel_id VARCHAR(100),
  message_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification templates
CREATE TABLE slack_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  template_type VARCHAR(50) NOT NULL,
  blocks JSONB NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification preferences
CREATE TABLE event_slack_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) UNIQUE,
  channel_id VARCHAR(100),
  vote_notifications BOOLEAN DEFAULT true,
  bid_notifications BOOLEAN DEFAULT true,
  round_notifications BOOLEAN DEFAULT true,
  threshold_settings JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 1.3 Core Edge Function
```typescript
// supabase/functions/slack-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { WebClient } from "https://deno.land/x/slack_web_api@1.0.0/mod.ts"

const slack = new WebClient(Deno.env.get('SLACK_BOT_TOKEN'))

serve(async (req) => {
  const { type, channel, message, blocks } = await req.json()
  
  try {
    const result = await slack.chat.postMessage({
      channel: channel,
      text: message,
      blocks: blocks
    })
    
    return new Response(JSON.stringify({ success: true, ts: result.ts }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
```

### Phase 2: Notification Triggers (Week 2)

#### 2.1 Vote Notifications
```sql
-- Function to queue vote notifications
CREATE OR REPLACE FUNCTION queue_vote_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_event_settings RECORD;
  v_vote_count INT;
  v_artist_name VARCHAR;
BEGIN
  -- Get event slack settings
  SELECT * INTO v_event_settings 
  FROM event_slack_settings 
  WHERE event_id = NEW.event_id;
  
  IF v_event_settings.vote_notifications AND v_event_settings.channel_id IS NOT NULL THEN
    -- Get current vote count
    SELECT COUNT(*) INTO v_vote_count
    FROM votes
    WHERE art_id = NEW.art_id;
    
    -- Get artist name
    SELECT ap.name INTO v_artist_name
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.id = NEW.art_id;
    
    -- Queue notification
    INSERT INTO slack_notifications (
      event_id, 
      channel_id, 
      message_type, 
      payload
    ) VALUES (
      NEW.event_id,
      v_event_settings.channel_id,
      'vote_update',
      jsonb_build_object(
        'art_id', NEW.art_id,
        'artist_name', v_artist_name,
        'vote_count', v_vote_count,
        'round', NEW.round,
        'voter_id', NEW.person_id
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER after_vote_insert
AFTER INSERT ON votes
FOR EACH ROW
EXECUTE FUNCTION queue_vote_notification();
```

#### 2.2 Bid Notifications
```sql
-- Function for bid notifications with thresholds
CREATE OR REPLACE FUNCTION queue_bid_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_event_settings RECORD;
  v_threshold NUMERIC;
  v_artist_name VARCHAR;
  v_art_code VARCHAR;
BEGIN
  -- Get event settings and threshold
  SELECT es.*, a.event_id, a.art_code
  INTO v_event_settings
  FROM art a
  JOIN event_slack_settings es ON es.event_id = a.event_id
  WHERE a.id = NEW.art_id;
  
  -- Check if bid meets notification threshold
  v_threshold := COALESCE(
    (v_event_settings.threshold_settings->>'min_bid_amount')::NUMERIC, 
    0
  );
  
  IF v_event_settings.bid_notifications 
     AND v_event_settings.channel_id IS NOT NULL
     AND NEW.amount >= v_threshold THEN
    
    -- Get artist info
    SELECT ap.name, a.art_code 
    INTO v_artist_name, v_art_code
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.id = NEW.art_id;
    
    -- Queue notification
    INSERT INTO slack_notifications (
      event_id,
      channel_id,
      message_type,
      payload
    ) VALUES (
      v_event_settings.event_id,
      v_event_settings.channel_id,
      'new_bid',
      jsonb_build_object(
        'art_id', NEW.art_id,
        'art_code', v_art_code,
        'artist_name', v_artist_name,
        'bid_amount', NEW.amount,
        'bidder_id', NEW.person_id,
        'is_high_value', NEW.amount > 1000
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_bid_insert
AFTER INSERT ON bids
FOR EACH ROW
EXECUTE FUNCTION queue_bid_notification();
```

### Phase 3: Message Processing (Week 3)

#### 3.1 Notification Processor
```sql
-- Function to process notification queue
CREATE OR REPLACE FUNCTION process_slack_queue()
RETURNS void AS $$
DECLARE
  v_notification RECORD;
  v_formatted_message JSONB;
BEGIN
  -- Get pending notifications
  FOR v_notification IN 
    SELECT * FROM slack_notifications 
    WHERE status = 'pending' 
    AND attempts < 3
    ORDER BY created_at
    LIMIT 10
  LOOP
    -- Format message based on type
    v_formatted_message := format_slack_message(
      v_notification.message_type, 
      v_notification.payload
    );
    
    -- Call edge function
    PERFORM net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/slack-webhook',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'channel', v_notification.channel_id,
        'blocks', v_formatted_message
      )
    );
    
    -- Update notification status
    UPDATE slack_notifications
    SET 
      status = 'sent',
      sent_at = NOW(),
      attempts = attempts + 1
    WHERE id = v_notification.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

#### 3.2 Message Formatter
```sql
CREATE OR REPLACE FUNCTION format_slack_message(
  p_type VARCHAR,
  p_payload JSONB
) RETURNS JSONB AS $$
BEGIN
  CASE p_type
    WHEN 'vote_update' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format('🗳️ *New Vote!*\nArtist: %s\nTotal Votes: %s\nRound: %s',
              p_payload->>'artist_name',
              p_payload->>'vote_count',
              p_payload->>'round'
            )
          )
        )
      );
      
    WHEN 'new_bid' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format('💰 %s*New Bid!*\nArtwork: %s by %s\nAmount: $%s',
              CASE WHEN (p_payload->>'is_high_value')::boolean 
                THEN '🔥 ' ELSE '' END,
              p_payload->>'art_code',
              p_payload->>'artist_name',
              p_payload->>'bid_amount'
            )
          )
        )
      );
      
    WHEN 'round_complete' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format('🏁 *Round %s Complete!*\nWinner: %s\nVotes: %s',
              p_payload->>'round_number',
              p_payload->>'winner_name',
              p_payload->>'winner_votes'
            )
          )
        )
      );
      
    ELSE
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', p_payload->>'message'
          )
        )
      );
  END CASE;
END;
$$ LANGUAGE plpgsql;
```

### Phase 4: Admin Interface Integration (Week 4)

#### 4.1 Update EventEditor Component
```javascript
// Add to EventEditor.jsx
const [slackSettings, setSlackSettings] = useState({
  channel_id: '',
  vote_notifications: true,
  bid_notifications: true,
  round_notifications: true,
  min_bid_threshold: 100
});

// Slack configuration section
<Box mt="4">
  <Heading size="3" mb="3">Slack Integration</Heading>
  <Grid columns="2" gap="4">
    <Box>
      <Text size="2" weight="medium" mb="1">Slack Channel ID</Text>
      <TextField.Root
        value={slackSettings.channel_id || ''}
        onChange={(e) => updateSlackSettings('channel_id', e.target.value)}
        placeholder="C1234567890"
      />
    </Box>
    
    <Box>
      <Text size="2" weight="medium" mb="1">Minimum Bid Alert</Text>
      <TextField.Root
        type="number"
        value={slackSettings.min_bid_threshold || ''}
        onChange={(e) => updateSlackSettings('min_bid_threshold', e.target.value)}
        placeholder="100"
      />
    </Box>
  </Grid>
  
  <Flex gap="4" mt="3">
    <Switch
      checked={slackSettings.vote_notifications}
      onCheckedChange={(checked) => updateSlackSettings('vote_notifications', checked)}
    />
    <Text size="2">Vote Notifications</Text>
    
    <Switch
      checked={slackSettings.bid_notifications}
      onCheckedChange={(checked) => updateSlackSettings('bid_notifications', checked)}
    />
    <Text size="2">Bid Notifications</Text>
    
    <Switch
      checked={slackSettings.round_notifications}
      onCheckedChange={(checked) => updateSlackSettings('round_notifications', checked)}
    />
    <Text size="2">Round Notifications</Text>
  </Flex>
  
  <Button 
    size="2" 
    variant="soft" 
    mt="3"
    onClick={testSlackConnection}
  >
    Test Slack Connection
  </Button>
</Box>
```

### Phase 5: Slash Commands (Week 5)

#### 5.1 Command Handler Edge Function
```typescript
// supabase/functions/slack-commands/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  const formData = await req.formData()
  const command = formData.get('command')
  const text = formData.get('text')
  const channel_id = formData.get('channel_id')
  
  switch(command) {
    case '/vote-status':
      return await handleVoteStatus(text, channel_id)
    case '/auction-status':
      return await handleAuctionStatus(text, channel_id)
    case '/event-summary':
      return await handleEventSummary(text, channel_id)
    default:
      return new Response('Unknown command', { status: 400 })
  }
})

async function handleVoteStatus(eventEid: string, channelId: string) {
  const { data } = await supabase.rpc('get_vote_summary', { 
    p_event_eid: eventEid 
  })
  
  const blocks = formatVoteSummary(data)
  
  return new Response(JSON.stringify({
    response_type: 'in_channel',
    blocks: blocks
  }), {
    headers: { "Content-Type": "application/json" }
  })
}
```

## Notification Types

### 1. Voting Notifications
- New vote cast
- Voting milestone reached (100, 500, 1000 votes)
- Round voting complete
- Leading artist change

### 2. Auction Notifications
- New bid placed
- High-value bid (configurable threshold)
- Auction closing soon (5 min warning)
- Auction won
- Payment received

### 3. Administrative Notifications
- Artist assigned to easel
- Round started/completed
- Event started/ended
- System errors
- Photo uploads

### 4. Summary Notifications
- Hourly voting summary
- Daily auction summary
- Event completion report

## Database Functions for Notifications

### Summary Generation
```sql
-- Get current voting leaders
CREATE OR REPLACE FUNCTION get_voting_leaders(p_event_id UUID)
RETURNS TABLE (
  round INT,
  artist_name VARCHAR,
  vote_count BIGINT,
  art_code VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  WITH current_round AS (
    SELECT MAX(round_number) as current
    FROM rounds
    WHERE event_id = p_event_id
  )
  SELECT 
    a.round,
    ap.name as artist_name,
    COUNT(v.id) as vote_count,
    a.art_code
  FROM art a
  JOIN artist_profiles ap ON a.artist_id = ap.id
  LEFT JOIN votes v ON v.art_id = a.id
  WHERE a.event_id = p_event_id
    AND a.round = (SELECT current FROM current_round)
  GROUP BY a.id, ap.name
  ORDER BY vote_count DESC
  LIMIT 3;
END;
$$ LANGUAGE plpgsql;

-- Get auction summary
CREATE OR REPLACE FUNCTION get_auction_summary(p_event_id UUID)
RETURNS TABLE (
  total_bids BIGINT,
  unique_bidders BIGINT,
  total_value NUMERIC,
  highest_bid NUMERIC,
  highest_bid_art VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(b.id) as total_bids,
    COUNT(DISTINCT b.person_id) as unique_bidders,
    SUM(max_bids.amount) as total_value,
    MAX(max_bids.amount) as highest_bid,
    (SELECT art_code FROM art WHERE id = 
      (SELECT art_id FROM bids WHERE amount = MAX(max_bids.amount) LIMIT 1)
    ) as highest_bid_art
  FROM (
    SELECT art_id, MAX(amount) as amount
    FROM bids b
    JOIN art a ON b.art_id = a.id
    WHERE a.event_id = p_event_id
    GROUP BY art_id
  ) max_bids;
END;
$$ LANGUAGE plpgsql;
```

## Scheduled Jobs

### Using pg_cron for scheduled notifications
```sql
-- Install pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule hourly vote summary
SELECT cron.schedule(
  'hourly-vote-summary',
  '0 * * * *',
  $$
  INSERT INTO slack_notifications (event_id, channel_id, message_type, payload)
  SELECT 
    es.event_id,
    es.channel_id,
    'hourly_summary',
    jsonb_build_object(
      'type', 'vote_summary',
      'data', get_voting_leaders(es.event_id)
    )
  FROM event_slack_settings es
  JOIN events e ON es.event_id = e.id
  WHERE e.enabled = true
    AND e.event_start_datetime <= NOW()
    AND e.event_end_datetime >= NOW();
  $$
);

-- Process notification queue every minute
SELECT cron.schedule(
  'process-slack-queue',
  '* * * * *',
  $$ SELECT process_slack_queue(); $$
);
```

## Security Considerations

1. **Authentication**
   - Verify Slack signing secret for all incoming webhooks
   - Use Supabase service role key for Edge Functions
   - Implement request signing validation

2. **Rate Limiting**
   - Implement per-channel rate limits
   - Queue notifications to prevent overwhelming Slack API
   - Exponential backoff for failed messages

3. **Data Privacy**
   - Don't expose personal information in public channels
   - Use person IDs rather than names/emails in logs
   - Implement audit logging for all notifications

## Monitoring & Analytics

### Notification Analytics Table
```sql
CREATE TABLE slack_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id),
  notification_type VARCHAR(50),
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track notification performance
CREATE OR REPLACE FUNCTION update_slack_analytics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO slack_analytics (
    event_id,
    notification_type,
    sent_count,
    last_sent_at
  ) VALUES (
    NEW.event_id,
    NEW.message_type,
    1,
    NEW.sent_at
  )
  ON CONFLICT (event_id, notification_type) 
  DO UPDATE SET
    sent_count = slack_analytics.sent_count + 1,
    last_sent_at = NEW.sent_at;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Testing Strategy

1. **Unit Tests**
   - Test each notification formatter function
   - Test threshold calculations
   - Test message queuing logic

2. **Integration Tests**
   - Test Slack API connectivity
   - Test end-to-end notification flow
   - Test error handling and retries

3. **Load Testing**
   - Simulate high-volume voting
   - Test queue processing under load
   - Verify rate limiting works correctly

## Deployment Checklist

- [ ] Environment variables configured in Supabase dashboard
- [ ] Database migrations applied
- [ ] Edge Functions deployed
- [ ] Slack app configured with proper scopes
- [ ] Webhook URLs registered in Slack app
- [ ] Test notifications working
- [ ] Monitoring dashboards created
- [ ] Documentation updated
- [ ] Team trained on new features

## Future Enhancements

1. **Rich Media Notifications**
   - Include artwork images in notifications
   - Video clips of rounds
   - Interactive buttons for quick actions

2. **Advanced Analytics**
   - Predictive notifications (likely winners)
   - Trend analysis
   - Comparative event performance

3. **Multi-Channel Support**
   - Discord integration
   - Microsoft Teams
   - Custom webhooks

4. **AI-Powered Insights**
   - Natural language summaries
   - Anomaly detection
   - Personalized notification preferences

## Maintenance

### Regular Tasks
- Monitor notification queue depth
- Review failed notifications weekly
- Update message templates based on feedback
- Audit Slack channel permissions
- Archive old notification logs

### Performance Optimization
- Index notification tables properly
- Partition large tables by date
- Implement connection pooling
- Cache frequently accessed data