-- Fix cast_vote_secure to match current votes table structure
-- The votes table now has: eid, round, easel, art_id (varchar), artist_profile_id, etc.

CREATE OR REPLACE FUNCTION cast_vote_secure(
  p_eid VARCHAR(20),
  p_round INT,
  p_easel INT
) RETURNS JSONB AS $$
DECLARE
  v_auth_user_id UUID;
  v_person_id UUID;
  v_event_id UUID;
  v_existing_vote_id UUID;
  v_auth_phone TEXT;
  v_auth_metadata JSONB;
  v_nickname TEXT;
  v_vote_weight NUMERIC(5,2);
  v_weight_info JSONB;
  v_art_id VARCHAR(50);
  v_artist_profile_id UUID;
  v_hash VARCHAR(50);
BEGIN
  -- Get authenticated user
  v_auth_user_id := auth.uid();
  
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;
  
  -- Construct art_id from eid-round-easel
  v_art_id := p_eid || '-' || p_round || '-' || p_easel;
  
  -- Get event_id from events table using eid
  SELECT id INTO v_event_id
  FROM events
  WHERE eid = p_eid;
  
  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event not found'
    );
  END IF;
  
  -- Get user's phone from auth metadata
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
  SELECT id, hash INTO v_person_id, v_hash
  FROM people
  WHERE auth_user_id = v_auth_user_id
     OR (v_auth_phone IS NOT NULL AND (phone = v_auth_phone OR phone_number = v_auth_phone));
  
  IF v_person_id IS NULL THEN
    -- Create minimal person record for voting
    v_person_id := gen_random_uuid();
    v_hash := encode(sha256((v_auth_phone || NOW()::TEXT)::bytea), 'hex');
    
    INSERT INTO people (
      id,
      auth_user_id,
      auth_phone,
      phone_number,
      phone,
      nickname,
      hash,
      created_at,
      updated_at
    ) VALUES (
      v_person_id,
      v_auth_user_id,
      v_auth_phone,
      v_auth_phone,
      v_auth_phone,
      v_nickname,
      v_hash,
      NOW(),
      NOW()
    );
  ELSE
    -- Update existing person record with latest info
    UPDATE people
    SET 
      auth_user_id = COALESCE(auth_user_id, v_auth_user_id),
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
  
  -- Get artist_profile_id if exists (based on round and easel)
  -- This might need adjustment based on how artist profiles are linked
  SELECT ap.id INTO v_artist_profile_id
  FROM artist_profiles ap
  WHERE ap.entry_id = p_easel
    AND EXISTS (
      SELECT 1 FROM events e 
      WHERE e.id = v_event_id 
        AND e.eid = p_eid
    )
  LIMIT 1;
  
  -- Check for existing vote
  SELECT id INTO v_existing_vote_id
  FROM votes
  WHERE eid = p_eid
    AND round = p_round
    AND easel = p_easel
    AND person_id = v_person_id;
    
  IF v_existing_vote_id IS NOT NULL THEN
    -- Remove existing vote
    DELETE FROM votes
    WHERE id = v_existing_vote_id;
    
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
      event_id,
      eid,
      round,
      easel,
      art_id,
      artist_profile_id,
      hash,
      phone,
      person_id,
      vote_factor,
      timestamp,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_event_id,
      p_eid,
      p_round,
      p_easel,
      v_art_id,
      v_artist_profile_id,
      v_hash,
      v_auth_phone,
      v_person_id,
      v_vote_weight,
      NOW(),
      NOW(),
      NOW()
    );
    
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION cast_vote_secure(VARCHAR, INT, INT) TO authenticated;

-- Also create a helper function to get weighted votes for an event
CREATE OR REPLACE FUNCTION get_event_weighted_votes_by_eid(
  p_eid VARCHAR(20),
  p_round INT DEFAULT NULL
)
RETURNS TABLE (
  easel INT,
  art_id VARCHAR(50),
  raw_vote_count BIGINT,
  weighted_vote_total NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.easel,
    v.art_id,
    COUNT(*)::BIGINT as raw_vote_count,
    COALESCE(SUM(v.vote_factor), 0) as weighted_vote_total
  FROM votes v
  WHERE v.eid = p_eid
    AND (p_round IS NULL OR v.round = p_round)
  GROUP BY v.easel, v.art_id
  ORDER BY weighted_vote_total DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_event_weighted_votes_by_eid(VARCHAR, INT) TO authenticated;

-- Add comments explaining the vote weight system
COMMENT ON FUNCTION cast_vote_secure IS 
'Secure voting function that calculates and applies vote weights.
Parameters:
- p_eid: Event ID (e.g., "VAN24")
- p_round: Round number
- p_easel: Easel number
Returns JSON with success status and vote weight information.';

COMMENT ON COLUMN votes.vote_factor IS 
'Vote weight calculated based on:
- Base: 1.0
- Artist bonus: +1.0 (2x for artists)
- Vote history: +0.1 per past vote (max +3.0)
- Bid history: +0.001 per dollar (max +2.0)
- Max possible: 6.0';