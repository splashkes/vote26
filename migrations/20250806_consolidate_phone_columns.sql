-- Consolidate phone columns in people table
-- Keep 'phone' column (has 102k entries) and migrate data from phone_number (3 entries)

-- First, migrate any phone_number data to phone where phone is null
UPDATE people 
SET phone = phone_number 
WHERE phone IS NULL AND phone_number IS NOT NULL;

-- Migrate auth_phone data where both phone and phone_number are null
UPDATE people 
SET phone = auth_phone 
WHERE phone IS NULL AND auth_phone IS NOT NULL;

-- Update the materialized view to only use the phone column
DROP MATERIALIZED VIEW IF EXISTS person_vote_weights CASCADE;

CREATE MATERIALIZED VIEW person_vote_weights AS
WITH weight_calculations AS (
  SELECT 
    p.id as person_id,
    p.phone,
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
  WHERE p.phone IS NOT NULL OR p.auth_phone IS NOT NULL
)
SELECT 
  person_id,
  phone,
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

-- Recreate indexes
CREATE UNIQUE INDEX idx_person_vote_weights_person_id ON person_vote_weights (person_id);
CREATE INDEX idx_person_vote_weights_phone ON person_vote_weights (phone);
CREATE INDEX idx_person_vote_weights_auth_phone ON person_vote_weights (auth_phone);
CREATE INDEX idx_person_vote_weights_total ON person_vote_weights (total_weight DESC);

-- Update cast_vote_secure to use only 'phone' column
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
  
  -- Get or create person record (using only phone column)
  SELECT id, hash INTO v_person_id, v_hash
  FROM people
  WHERE auth_user_id = v_auth_user_id
     OR (v_auth_phone IS NOT NULL AND phone = v_auth_phone);
  
  IF v_person_id IS NULL THEN
    -- Create minimal person record for voting
    v_person_id := gen_random_uuid();
    v_hash := encode(sha256((v_auth_phone || NOW()::TEXT)::bytea), 'hex');
    
    INSERT INTO people (
      id,
      auth_user_id,
      auth_phone,
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
      phone = COALESCE(phone, v_auth_phone),
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
GRANT SELECT ON person_vote_weights TO authenticated;

-- Note: We're keeping phone_number column for now in case there are other dependencies
-- It can be dropped in a future migration after verifying all code is updated

-- Add comment about the consolidation
COMMENT ON COLUMN people.phone IS 'Primary phone number field (consolidated from phone, phone_number, and auth_phone)';
COMMENT ON COLUMN people.phone_number IS 'DEPRECATED - Use phone column instead. Will be removed in future migration.';
COMMENT ON COLUMN people.auth_phone IS 'Phone from auth system - synced to phone column when needed.';