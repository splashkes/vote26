-- Slack Integration Schema
-- This migration creates the necessary tables and functions for Slack notifications

-- 1. Notification queue table
CREATE TABLE IF NOT EXISTS slack_notifications (
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

-- Index for queue processing
CREATE INDEX IF NOT EXISTS idx_slack_notifications_pending 
ON slack_notifications(status, created_at) 
WHERE status = 'pending';

-- 2. Notification templates table
CREATE TABLE IF NOT EXISTS slack_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  template_type VARCHAR(50) NOT NULL,
  blocks JSONB NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Event slack settings table
CREATE TABLE IF NOT EXISTS event_slack_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) UNIQUE,
  channel_id VARCHAR(100),
  vote_notifications BOOLEAN DEFAULT true,
  bid_notifications BOOLEAN DEFAULT true,
  round_notifications BOOLEAN DEFAULT true,
  threshold_settings JSONB DEFAULT '{"min_bid_amount": 100}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Slack analytics table
CREATE TABLE IF NOT EXISTS slack_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id),
  notification_type VARCHAR(50),
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index for analytics
CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_analytics_event_type 
ON slack_analytics(event_id, notification_type);

-- 5. Store Slack credentials in vault (these will need to be added via Supabase dashboard)
-- INSERT INTO vault.secrets (name, secret) VALUES 
-- ('SLACK_BOT_TOKEN', 'REDACTED_SLACK_BOT_TOKEN'),
-- ('SLACK_SIGNING_SECRET', 'REDACTED_SLACK_SIGNING_SECRET'),
-- ('SLACK_APP_TOKEN', 'REDACTED_SLACK_APP_TOKEN');

-- 6. Message formatting function
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
              to_char((p_payload->>'bid_amount')::numeric, 'FM999,999.00')
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
      
    WHEN 'vote_milestone' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', format('🎉 *Voting Milestone!*\n%s votes reached!\nEvent: %s',
              p_payload->>'milestone',
              p_payload->>'event_name'
            )
          )
        )
      );
      
    WHEN 'hourly_summary' THEN
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', '📊 *Hourly Voting Summary*'
          )
        ),
        jsonb_build_object(
          'type', 'section',
          'fields', p_payload->'leaders'
        )
      );
      
    ELSE
      RETURN jsonb_build_array(
        jsonb_build_object(
          'type', 'section',
          'text', jsonb_build_object(
            'type', 'mrkdwn',
            'text', COALESCE(p_payload->>'message', 'Art Battle Notification')
          )
        )
      );
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- 7. Vote notification trigger function
CREATE OR REPLACE FUNCTION queue_vote_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_event_settings RECORD;
  v_vote_count INT;
  v_artist_name VARCHAR;
  v_event_name VARCHAR;
BEGIN
  -- Get event slack settings
  SELECT es.*, e.name as event_name
  INTO v_event_settings 
  FROM event_slack_settings es
  JOIN events e ON e.id = es.event_id
  WHERE es.event_id = NEW.event_id;
  
  -- Only proceed if notifications are enabled and channel is set
  IF v_event_settings.vote_notifications AND v_event_settings.channel_id IS NOT NULL THEN
    -- Get current vote count for this art piece
    SELECT COUNT(*) INTO v_vote_count
    FROM votes
    WHERE art_id = NEW.art_id;
    
    -- Get artist name
    SELECT ap.name INTO v_artist_name
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.id = NEW.art_id;
    
    -- Queue notification for every 10th vote to avoid spam
    IF v_vote_count % 10 = 0 OR v_vote_count = 1 THEN
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
    
    -- Check for milestones
    IF v_vote_count IN (100, 500, 1000, 5000) THEN
      INSERT INTO slack_notifications (
        event_id, 
        channel_id, 
        message_type, 
        payload
      ) VALUES (
        NEW.event_id,
        v_event_settings.channel_id,
        'vote_milestone',
        jsonb_build_object(
          'milestone', v_vote_count,
          'event_name', v_event_settings.event_name
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create vote trigger
DROP TRIGGER IF EXISTS after_vote_insert ON votes;
CREATE TRIGGER after_vote_insert
AFTER INSERT ON votes
FOR EACH ROW
EXECUTE FUNCTION queue_vote_notification();

-- 8. Bid notification trigger function
CREATE OR REPLACE FUNCTION queue_bid_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_event_settings RECORD;
  v_threshold NUMERIC;
  v_artist_name VARCHAR;
  v_art_code VARCHAR;
  v_event_id UUID;
BEGIN
  -- Get event ID from art table
  SELECT event_id, art_code INTO v_event_id, v_art_code
  FROM art 
  WHERE id = NEW.art_id;
  
  -- Get event settings
  SELECT * INTO v_event_settings
  FROM event_slack_settings
  WHERE event_id = v_event_id;
  
  -- Check if we should send notification
  IF v_event_settings.bid_notifications AND v_event_settings.channel_id IS NOT NULL THEN
    -- Get threshold
    v_threshold := COALESCE(
      (v_event_settings.threshold_settings->>'min_bid_amount')::NUMERIC, 
      100
    );
    
    -- Only notify for bids above threshold
    IF NEW.amount >= v_threshold THEN
      -- Get artist info
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
        v_event_id,
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
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create bid trigger
DROP TRIGGER IF EXISTS after_bid_insert ON bids;
CREATE TRIGGER after_bid_insert
AFTER INSERT ON bids
FOR EACH ROW
EXECUTE FUNCTION queue_bid_notification();

-- 9. Round completion notification
CREATE OR REPLACE FUNCTION notify_round_complete()
RETURNS TRIGGER AS $$
DECLARE
  v_event_settings RECORD;
  v_winner RECORD;
BEGIN
  -- Only trigger when round is marked as finished
  IF NEW.is_finished = true AND OLD.is_finished = false THEN
    -- Get event settings
    SELECT * INTO v_event_settings
    FROM event_slack_settings
    WHERE event_id = NEW.event_id;
    
    IF v_event_settings.round_notifications AND v_event_settings.channel_id IS NOT NULL THEN
      -- Get round winner
      SELECT ap.name as artist_name, COUNT(v.id) as vote_count
      INTO v_winner
      FROM round_contestants rc
      JOIN artist_profiles ap ON rc.artist_id = ap.id
      LEFT JOIN art a ON a.artist_id = ap.id AND a.event_id = NEW.event_id AND a.round = NEW.round_number
      LEFT JOIN votes v ON v.art_id = a.id
      WHERE rc.round_id = NEW.id AND rc.is_winner = 1
      GROUP BY ap.name
      LIMIT 1;
      
      IF v_winner.artist_name IS NOT NULL THEN
        INSERT INTO slack_notifications (
          event_id,
          channel_id,
          message_type,
          payload
        ) VALUES (
          NEW.event_id,
          v_event_settings.channel_id,
          'round_complete',
          jsonb_build_object(
            'round_number', NEW.round_number,
            'winner_name', v_winner.artist_name,
            'winner_votes', v_winner.vote_count
          )
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create round update trigger
DROP TRIGGER IF EXISTS after_round_update ON rounds;
CREATE TRIGGER after_round_update
AFTER UPDATE ON rounds
FOR EACH ROW
EXECUTE FUNCTION notify_round_complete();

-- 10. Analytics update trigger
CREATE OR REPLACE FUNCTION update_slack_analytics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'sent' THEN
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
  ELSIF NEW.status = 'failed' THEN
    INSERT INTO slack_analytics (
      event_id,
      notification_type,
      failed_count
    ) VALUES (
      NEW.event_id,
      NEW.message_type,
      1
    )
    ON CONFLICT (event_id, notification_type) 
    DO UPDATE SET
      failed_count = slack_analytics.failed_count + 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create analytics trigger
DROP TRIGGER IF EXISTS after_notification_update ON slack_notifications;
CREATE TRIGGER after_notification_update
AFTER UPDATE ON slack_notifications
FOR EACH ROW
WHEN (OLD.status != NEW.status)
EXECUTE FUNCTION update_slack_analytics();

-- 11. Helper function to get voting leaders
CREATE OR REPLACE FUNCTION get_voting_leaders(p_event_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_leaders JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', 'mrkdwn',
      'text', format('%s. *%s* - %s votes', 
        row_num, 
        artist_name, 
        vote_count
      )
    )
  ) INTO v_leaders
  FROM (
    SELECT 
      ROW_NUMBER() OVER (ORDER BY COUNT(v.id) DESC) as row_num,
      ap.name as artist_name,
      COUNT(v.id) as vote_count
    FROM art a
    JOIN artist_profiles ap ON a.artist_id = ap.id
    LEFT JOIN votes v ON v.art_id = a.id
    WHERE a.event_id = p_event_id
      AND a.round = (
        SELECT current_round 
        FROM events 
        WHERE id = p_event_id
      )
    GROUP BY ap.id, ap.name
    ORDER BY vote_count DESC
    LIMIT 5
  ) leaders;
  
  RETURN COALESCE(v_leaders, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL ON slack_notifications TO authenticated;
GRANT ALL ON slack_templates TO authenticated;
GRANT ALL ON event_slack_settings TO authenticated;
GRANT ALL ON slack_analytics TO authenticated;

-- Add RLS policies
ALTER TABLE slack_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_slack_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_analytics ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_all" ON slack_notifications FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON slack_templates FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON event_slack_settings FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON slack_analytics FOR ALL TO service_role USING (true);

-- Allow authenticated users to read their event settings
CREATE POLICY "auth_read_event_settings" ON event_slack_settings
FOR SELECT TO authenticated
USING (true);