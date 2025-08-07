-- Vote Weight System Implementation
-- Calculates vote weights based on:
-- 1. Artist status (2x weight)
-- 2. Past voting history (+0.1 per vote, max +3.0)
-- 3. Past bidding history (+0.001 per dollar, max +2.0)
-- 4. Manual overrides (TODO - future implementation)

-- Drop existing objects if they exist (for re-running)
DROP MATERIALIZED VIEW IF EXISTS person_vote_weights CASCADE;
DROP FUNCTION IF EXISTS calculate_vote_weight CASCADE;
DROP FUNCTION IF EXISTS refresh_vote_weights CASCADE;

-- Function to calculate vote weight for a person
CREATE OR REPLACE FUNCTION calculate_vote_weight(p_person_id UUID)
RETURNS TABLE (
  base_weight NUMERIC(4,2),
  artist_bonus NUMERIC(4,2),
  vote_history_bonus NUMERIC(4,2),
  bid_history_bonus NUMERIC(4,2),
  total_weight NUMERIC(4,2)
) AS $$
DECLARE
  v_is_artist BOOLEAN;
  v_past_votes_count INT;
  v_total_bid_amount NUMERIC(10,2);
  v_base NUMERIC(4,2) := 1.0;
  v_artist_bonus NUMERIC(4,2) := 0.0;
  v_vote_bonus NUMERIC(4,2) := 0.0;
  v_bid_bonus NUMERIC(4,2) := 0.0;
BEGIN
  -- Get artist status
  SELECT is_artist INTO v_is_artist
  FROM people
  WHERE id = p_person_id;
  
  -- Calculate artist bonus (2x means +1.0)
  IF v_is_artist = true THEN
    v_artist_bonus := 1.0;
  END IF;
  
  -- Calculate vote history bonus (+0.1 per vote, max +3.0)
  SELECT COUNT(*) INTO v_past_votes_count
  FROM votes
  WHERE person_id = p_person_id;
  
  v_vote_bonus := LEAST(v_past_votes_count * 0.1, 3.0);
  
  -- Calculate bid history bonus (+0.001 per dollar, max +2.0)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_bid_amount
  FROM bids
  WHERE person_id = p_person_id;
  
  v_bid_bonus := LEAST(v_total_bid_amount * 0.001, 2.0);
  
  -- Return the calculated weights
  RETURN QUERY SELECT 
    v_base,
    v_artist_bonus,
    v_vote_bonus::NUMERIC(4,2),
    v_bid_bonus::NUMERIC(4,2),
    (v_base + v_artist_bonus + v_vote_bonus + v_bid_bonus)::NUMERIC(4,2);
END;
$$ LANGUAGE plpgsql STABLE;

-- Materialized view for person vote weights
CREATE MATERIALIZED VIEW person_vote_weights AS
WITH weight_calculations AS (
  SELECT 
    p.id as person_id,
    p.phone_number,
    p.auth_phone,
    p.is_artist,
    p.email,
    p.nickname,
    -- Count past votes
    COALESCE(v.vote_count, 0) as past_votes_count,
    -- Sum past bids
    COALESCE(b.total_bid_amount, 0) as total_bid_amount,
    -- Calculate components
    1.0::NUMERIC(4,2) as base_weight,
    CASE WHEN p.is_artist = true THEN 1.0::NUMERIC(4,2) ELSE 0.0::NUMERIC(4,2) END as artist_bonus,
    LEAST(COALESCE(v.vote_count, 0) * 0.1, 3.0)::NUMERIC(4,2) as vote_history_bonus,
    LEAST(COALESCE(b.total_bid_amount, 0) * 0.001, 2.0)::NUMERIC(4,2) as bid_history_bonus
  FROM people p
  LEFT JOIN (
    SELECT person_id, COUNT(*) as vote_count
    FROM votes
    GROUP BY person_id
  ) v ON p.id = v.person_id
  LEFT JOIN (
    SELECT person_id, SUM(amount) as total_bid_amount
    FROM bids
    GROUP BY person_id
  ) b ON p.id = b.person_id
  WHERE p.phone_number IS NOT NULL OR p.auth_phone IS NOT NULL
)
SELECT 
  person_id,
  phone_number,
  auth_phone,
  email,
  nickname,
  is_artist,
  past_votes_count,
  total_bid_amount,
  base_weight,
  artist_bonus,
  vote_history_bonus,
  bid_history_bonus,
  (base_weight + artist_bonus + vote_history_bonus + bid_history_bonus)::NUMERIC(4,2) as total_weight,
  NOW() as last_calculated
FROM weight_calculations;

-- Create indexes for performance
CREATE UNIQUE INDEX idx_person_vote_weights_person_id ON person_vote_weights (person_id);
CREATE INDEX idx_person_vote_weights_phone ON person_vote_weights (phone_number);
CREATE INDEX idx_person_vote_weights_auth_phone ON person_vote_weights (auth_phone);
CREATE INDEX idx_person_vote_weights_total ON person_vote_weights (total_weight DESC);

-- Function to refresh vote weights
CREATE OR REPLACE FUNCTION refresh_vote_weights()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY person_vote_weights;
END;
$$ LANGUAGE plpgsql;

-- Update the cast_vote_secure function to use vote weights
CREATE OR REPLACE FUNCTION cast_vote_secure(
  p_art_id TEXT  -- This will be a UUID string
) RETURNS JSONB AS $$
DECLARE
  v_auth_user_id UUID;
  v_person_id UUID;
  v_art_uuid UUID;
  v_event_id UUID;
  v_existing_vote_id UUID;
  v_round INT;
  v_auth_phone TEXT;
  v_auth_metadata JSONB;
  v_nickname TEXT;
  v_vote_weight NUMERIC(4,2);
  v_weight_info JSONB;
BEGIN
  -- Get authenticated user
  v_auth_user_id := auth.uid();
  
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;
  
  -- Convert the text UUID to actual UUID type
  BEGIN
    v_art_uuid := p_art_id::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid artwork ID format'
      );
  END;
  
  -- Get event and round, check if artwork exists
  SELECT event_id, round INTO v_event_id, v_round
  FROM art
  WHERE id = v_art_uuid;
  
  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Artwork not found'
    );
  END IF;
  
  -- Get user's phone from auth metadata for logging
  SELECT 
    raw_user_meta_data->>'phone' as phone,
    raw_user_meta_data
  INTO v_auth_phone, v_auth_metadata
  FROM auth.users
  WHERE id = v_auth_user_id;
  
  -- Extract nickname from metadata
  v_nickname := COALESCE(
    v_auth_metadata->>'nickname',
    v_auth_metadata->>'name',
    SPLIT_PART(v_auth_metadata->>'email', '@', 1)
  );
  
  -- Get or create person record
  SELECT id INTO v_person_id
  FROM people
  WHERE auth_user_id = v_auth_user_id;
  
  IF v_person_id IS NULL THEN
    -- Create minimal person record for voting
    v_person_id := gen_random_uuid();
    
    INSERT INTO people (
      id,
      auth_user_id,
      auth_phone,
      phone_number,
      nickname,
      created_at,
      updated_at
    ) VALUES (
      v_person_id,
      v_auth_user_id,
      v_auth_phone,
      v_auth_phone,
      v_nickname,
      NOW(),
      NOW()
    );
  ELSE
    -- Update existing person record with latest info
    UPDATE people
    SET 
      auth_phone = COALESCE(v_auth_phone, auth_phone),
      phone_number = COALESCE(phone_number, v_auth_phone),
      nickname = COALESCE(nickname, v_nickname),
      updated_at = NOW()
    WHERE id = v_person_id;
  END IF;
  
  -- Get vote weight from materialized view
  SELECT 
    total_weight,
    jsonb_build_object(
      'base_weight', base_weight,
      'artist_bonus', artist_bonus,
      'vote_history_bonus', vote_history_bonus,
      'bid_history_bonus', bid_history_bonus,
      'past_votes', past_votes_count,
      'total_bid_amount', total_bid_amount
    )
  INTO v_vote_weight, v_weight_info
  FROM person_vote_weights
  WHERE person_id = v_person_id;
  
  -- If not in materialized view, calculate in real-time
  IF v_vote_weight IS NULL THEN
    SELECT 
      total_weight,
      jsonb_build_object(
        'base_weight', base_weight,
        'artist_bonus', artist_bonus,
        'vote_history_bonus', vote_history_bonus,
        'bid_history_bonus', bid_history_bonus,
        'calculated', 'real-time'
      )
    INTO v_vote_weight, v_weight_info
    FROM calculate_vote_weight(v_person_id);
    
    -- Default to 1.0 if calculation fails
    IF v_vote_weight IS NULL THEN
      v_vote_weight := 1.0;
      v_weight_info := jsonb_build_object('calculated', 'default');
    END IF;
  END IF;
  
  -- Check for existing vote
  SELECT id INTO v_existing_vote_id
  FROM votes
  WHERE art_id = v_art_uuid
    AND person_id = v_person_id;
    
  IF v_existing_vote_id IS NOT NULL THEN
    -- Remove existing vote
    DELETE FROM votes
    WHERE id = v_existing_vote_id;
    
    -- Update vote count (we'll need to recalculate weighted count)
    UPDATE art
    SET vote_count = GREATEST(0, vote_count - 1)
    WHERE id = v_art_uuid;
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'unvoted',
      'message', 'Vote removed',
      'vote_weight', v_vote_weight,
      'weight_info', v_weight_info
    );
  ELSE
    -- Add new vote with calculated weight
    INSERT INTO votes (
      id,
      art_id,
      person_id,
      event_id,
      round,
      vote_factor,  -- Store the calculated weight
      auth_method,
      auth_timestamp,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_art_uuid,
      v_person_id,
      v_event_id,
      v_round,
      v_vote_weight,  -- Use calculated weight
      'sms',
      NOW(),
      NOW()
    );
    
    -- Update vote count
    UPDATE art
    SET vote_count = vote_count + 1
    WHERE id = v_art_uuid;
    
    -- Queue Slack notification (non-blocking)
    BEGIN
      INSERT INTO slack_notifications (
        event_type,
        event_id,
        person_id,
        metadata
      ) VALUES (
        'vote_cast',
        v_event_id,
        v_person_id,
        jsonb_build_object(
          'art_id', v_art_uuid,
          'round', v_round,
          'nickname', v_nickname,
          'phone_last4', RIGHT(v_auth_phone, 4),
          'vote_weight', v_vote_weight,
          'weight_info', v_weight_info
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        -- Log but don't fail the vote
        RAISE WARNING 'Failed to queue Slack notification: %', SQLERRM;
    END;
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'voted',
      'message', 'Vote registered successfully',
      'vote_weight', v_vote_weight,
      'weight_info', v_weight_info
    );
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in cast_vote_secure: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An error occurred processing your vote',
      'detail', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure permissions
GRANT EXECUTE ON FUNCTION cast_vote_secure(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_vote_weight(UUID) TO authenticated;
GRANT SELECT ON person_vote_weights TO authenticated;

-- Create a function to get weighted vote totals for an artwork
CREATE OR REPLACE FUNCTION get_weighted_vote_total(p_art_id UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(vote_factor), 0)
  FROM votes
  WHERE art_id = p_art_id;
$$ LANGUAGE sql STABLE;

-- Create a function to get weighted vote totals for all art in an event/round
CREATE OR REPLACE FUNCTION get_event_weighted_votes(p_event_id UUID, p_round INT DEFAULT NULL)
RETURNS TABLE (
  art_id UUID,
  raw_vote_count BIGINT,
  weighted_vote_total NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.art_id,
    COUNT(*)::BIGINT as raw_vote_count,
    COALESCE(SUM(v.vote_factor), 0) as weighted_vote_total
  FROM votes v
  WHERE v.event_id = p_event_id
    AND (p_round IS NULL OR v.round = p_round)
  GROUP BY v.art_id
  ORDER BY weighted_vote_total DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions for the new functions
GRANT EXECUTE ON FUNCTION get_weighted_vote_total(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_weighted_votes(UUID, INT) TO authenticated;

-- Add comment explaining the system
COMMENT ON MATERIALIZED VIEW person_vote_weights IS 
'Pre-calculated vote weights for all users. Refreshed daily.
Weight calculation:
- Base weight: 1.0
- Artist bonus: +1.0 (total 2x for artists)
- Vote history: +0.1 per past vote (max +3.0)
- Bid history: +0.001 per dollar bid (max +2.0)
- Maximum possible weight: 6.0';