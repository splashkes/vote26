-- Slack Integration Test Setup
-- This file contains test data and helper functions for testing the Slack integration

-- 1. Create a test event with Slack settings
DO $$
DECLARE
  v_event_id UUID;
  v_test_channel VARCHAR := 'C07RB3ML3CU'; -- Replace with your actual Slack channel ID
BEGIN
  -- Check if test event already exists
  SELECT id INTO v_event_id FROM events WHERE eid = 'TEST123';
  
  IF v_event_id IS NULL THEN
    -- Create test event
    INSERT INTO events (
      eid, 
      name, 
      description, 
      venue, 
      event_start_datetime, 
      enabled, 
      show_in_app,
      current_round,
      vote_by_link,
      enable_auction
    ) VALUES (
      'TEST123',
      'Slack Integration Test Event',
      'Test event for Slack notifications',
      'Test Venue',
      NOW(),
      true,
      true,
      1,
      true,
      true
    ) RETURNING id INTO v_event_id;
  END IF;
  
  -- Add or update Slack settings for the test event
  INSERT INTO event_slack_settings (
    event_id,
    channel_id,
    vote_notifications,
    bid_notifications,
    round_notifications,
    threshold_settings
  ) VALUES (
    v_event_id,
    v_test_channel,
    true,
    true,
    true,
    '{"min_bid_amount": 50}'::jsonb
  )
  ON CONFLICT (event_id) 
  DO UPDATE SET 
    channel_id = v_test_channel,
    vote_notifications = true,
    bid_notifications = true,
    round_notifications = true;
    
  RAISE NOTICE 'Test event created/updated with ID: %', v_event_id;
END $$;

-- 2. Function to send a test notification
CREATE OR REPLACE FUNCTION send_test_slack_notification(
  p_message_type VARCHAR DEFAULT 'test',
  p_message TEXT DEFAULT 'This is a test notification from Art Battle Vote system'
) RETURNS JSONB AS $$
DECLARE
  v_event_id UUID;
  v_channel_id VARCHAR;
  v_notification_id UUID;
BEGIN
  -- Get test event
  SELECT e.id, es.channel_id 
  INTO v_event_id, v_channel_id
  FROM events e
  JOIN event_slack_settings es ON es.event_id = e.id
  WHERE e.eid = 'TEST123';
  
  IF v_channel_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No Slack channel configured for test event'
    );
  END IF;
  
  -- Queue test notification
  INSERT INTO slack_notifications (
    event_id,
    channel_id,
    message_type,
    payload
  ) VALUES (
    v_event_id,
    v_channel_id,
    p_message_type,
    jsonb_build_object(
      'message', p_message,
      'test', true,
      'timestamp', NOW()
    )
  ) RETURNING id INTO v_notification_id;
  
  -- Process immediately
  PERFORM process_slack_notification(v_notification_id);
  
  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'notification_id', v_notification_id,
    'channel_id', v_channel_id,
    'message', p_message
  );
END;
$$ LANGUAGE plpgsql;

-- 3. Function to simulate voting activity
CREATE OR REPLACE FUNCTION simulate_voting_activity(
  p_num_votes INT DEFAULT 5
) RETURNS JSONB AS $$
DECLARE
  v_event_id UUID;
  v_artist_id UUID;
  v_art_id UUID;
  v_person_id UUID;
  v_round INT := 1;
  i INT;
  v_votes_created INT := 0;
BEGIN
  -- Get test event
  SELECT id INTO v_event_id FROM events WHERE eid = 'TEST123';
  
  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Test event not found');
  END IF;
  
  -- Create a test artist if needed
  INSERT INTO artist_profiles (name, entry_id)
  VALUES ('Test Artist ' || NOW()::TEXT, 99999)
  ON CONFLICT (entry_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_artist_id;
  
  -- Create test art piece
  INSERT INTO art (
    event_id, 
    artist_id, 
    art_code, 
    round, 
    easel,
    status
  ) VALUES (
    v_event_id,
    v_artist_id,
    'TEST123-' || v_round || '-1',
    v_round,
    1,
    'active'
  )
  ON CONFLICT (art_code) DO UPDATE SET artist_id = v_artist_id
  RETURNING id INTO v_art_id;
  
  -- Create test votes
  FOR i IN 1..p_num_votes LOOP
    -- Create a test person
    INSERT INTO people (
      email,
      phone,
      name,
      hash
    ) VALUES (
      'test' || i || '@example.com',
      '+1555000' || LPAD(i::TEXT, 4, '0'),
      'Test Voter ' || i,
      'test_hash_' || i
    )
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_person_id;
    
    -- Create vote
    BEGIN
      INSERT INTO votes (
        event_id,
        round,
        art_id,
        person_id,
        auth_method,
        auth_timestamp
      ) VALUES (
        v_event_id,
        v_round,
        v_art_id,
        v_person_id,
        'qr',
        NOW()
      );
      
      v_votes_created := v_votes_created + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Vote already exists, skip
      NULL;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'votes_created', v_votes_created,
    'art_id', v_art_id,
    'artist_id', v_artist_id
  );
END;
$$ LANGUAGE plpgsql;

-- 4. Function to simulate bidding activity
CREATE OR REPLACE FUNCTION simulate_bidding_activity(
  p_num_bids INT DEFAULT 3,
  p_start_amount NUMERIC DEFAULT 100
) RETURNS JSONB AS $$
DECLARE
  v_event_id UUID;
  v_art_id UUID;
  v_person_id UUID;
  v_bid_amount NUMERIC;
  i INT;
  v_bids_created INT := 0;
BEGIN
  -- Get test event and art
  SELECT a.id INTO v_art_id
  FROM art a
  JOIN events e ON a.event_id = e.id
  WHERE e.eid = 'TEST123'
  ORDER BY a.created_at DESC
  LIMIT 1;
  
  IF v_art_id IS NULL THEN
    -- Create art if needed
    PERFORM simulate_voting_activity(1);
    
    SELECT a.id INTO v_art_id
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE e.eid = 'TEST123'
    ORDER BY a.created_at DESC
    LIMIT 1;
  END IF;
  
  -- Create test bids
  FOR i IN 1..p_num_bids LOOP
    -- Get or create test person
    INSERT INTO people (
      email,
      phone,
      name,
      hash
    ) VALUES (
      'bidder' || i || '@example.com',
      '+1555001' || LPAD(i::TEXT, 4, '0'),
      'Test Bidder ' || i,
      'test_bidder_hash_' || i
    )
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_person_id;
    
    -- Calculate bid amount
    v_bid_amount := p_start_amount + (i * 50);
    
    -- Create bid
    INSERT INTO bids (
      art_id,
      person_id,
      amount
    ) VALUES (
      v_art_id,
      v_person_id,
      v_bid_amount
    );
    
    v_bids_created := v_bids_created + 1;
    
    -- Small delay to ensure different timestamps
    PERFORM pg_sleep(0.1);
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'bids_created', v_bids_created,
    'art_id', v_art_id,
    'highest_bid', v_bid_amount
  );
END;
$$ LANGUAGE plpgsql;

-- 5. Function to test the complete notification flow
CREATE OR REPLACE FUNCTION test_slack_integration_flow()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_test_results JSONB := '[]'::jsonb;
BEGIN
  -- Test 1: Send test notification
  v_result := send_test_slack_notification('test', '🧪 Testing Slack integration...');
  v_test_results := v_test_results || jsonb_build_object(
    'test', 'Basic notification',
    'result', v_result
  );
  
  -- Test 2: Simulate voting
  v_result := simulate_voting_activity(5);
  v_test_results := v_test_results || jsonb_build_object(
    'test', 'Voting simulation',
    'result', v_result
  );
  
  -- Test 3: Simulate bidding
  v_result := simulate_bidding_activity(3, 150);
  v_test_results := v_test_results || jsonb_build_object(
    'test', 'Bidding simulation',
    'result', v_result
  );
  
  -- Test 4: Generate hourly summary
  SELECT id INTO v_result FROM events WHERE eid = 'TEST123';
  PERFORM generate_hourly_summary(v_result);
  v_test_results := v_test_results || jsonb_build_object(
    'test', 'Hourly summary',
    'result', jsonb_build_object('summary_queued', true)
  );
  
  -- Test 5: Process queue
  v_result := manual_process_slack_queue();
  v_test_results := v_test_results || jsonb_build_object(
    'test', 'Queue processing',
    'result', v_result
  );
  
  -- Test 6: Check queue status
  v_result := get_slack_queue_status();
  v_test_results := v_test_results || jsonb_build_object(
    'test', 'Queue status',
    'result', v_result
  );
  
  RETURN jsonb_build_object(
    'test_run_complete', true,
    'timestamp', NOW(),
    'tests', v_test_results
  );
END;
$$ LANGUAGE plpgsql;

-- 6. Cleanup function
CREATE OR REPLACE FUNCTION cleanup_slack_test_data()
RETURNS JSONB AS $$
DECLARE
  v_event_id UUID;
  v_deleted RECORD;
BEGIN
  -- Get test event ID
  SELECT id INTO v_event_id FROM events WHERE eid = 'TEST123';
  
  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('message', 'No test data found');
  END IF;
  
  -- Delete test data
  DELETE FROM slack_notifications WHERE event_id = v_event_id;
  DELETE FROM votes WHERE event_id = v_event_id;
  DELETE FROM bids WHERE art_id IN (SELECT id FROM art WHERE event_id = v_event_id);
  DELETE FROM art WHERE event_id = v_event_id;
  DELETE FROM event_slack_settings WHERE event_id = v_event_id;
  
  RETURN jsonb_build_object(
    'message', 'Test data cleaned up',
    'event_id', v_event_id
  );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION send_test_slack_notification(VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION simulate_voting_activity(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION simulate_bidding_activity(INT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION test_slack_integration_flow() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_slack_test_data() TO authenticated;

-- Instructions for testing:
-- 1. First, update the v_test_channel variable in this file with your actual Slack channel ID
-- 2. Run this migration to create test functions
-- 3. Add the Slack credentials to Supabase vault via the dashboard:
--    - SLACK_BOT_TOKEN: REDACTED_SLACK_BOT_TOKEN
--    - SLACK_SIGNING_SECRET: REDACTED_SLACK_SIGNING_SECRET
--    - SLACK_APP_TOKEN: REDACTED_SLACK_APP_TOKEN
-- 4. Deploy the Edge Function: supabase functions deploy slack-webhook
-- 5. Run the test: SELECT test_slack_integration_flow();