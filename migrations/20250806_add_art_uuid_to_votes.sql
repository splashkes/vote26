-- Add art_uuid column back to votes table for compatibility with frontend
-- This will store the UUID of the art piece alongside the art_id string

-- Add art_uuid column if it doesn't exist
ALTER TABLE votes 
ADD COLUMN IF NOT EXISTS art_uuid UUID REFERENCES art(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_votes_art_uuid ON votes(art_uuid);

-- Update existing votes to populate art_uuid based on art_code matching
UPDATE votes v
SET art_uuid = a.id
FROM art a
WHERE v.art_id = a.art_code
  AND v.art_uuid IS NULL;

-- Update cast_vote_secure to include art_uuid and always return vote_factor
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
  v_art_uuid UUID;
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
  
  -- Get event_id and art_uuid from tables
  SELECT e.id, a.id, a.artist_id 
  INTO v_event_id, v_art_uuid, v_artist_profile_id
  FROM events e
  LEFT JOIN art a ON a.event_id = e.id 
    AND a.round = p_round 
    AND a.easel = p_easel
  WHERE e.eid = p_eid;
  
  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event not found'
    );
  END IF;
  
  IF v_art_uuid IS NULL THEN
    -- Try to find by art_code as fallback
    SELECT id, artist_id INTO v_art_uuid, v_artist_profile_id
    FROM art
    WHERE art_code = v_art_id;
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
    
    -- Update vote count if art_uuid exists
    IF v_art_uuid IS NOT NULL THEN
      UPDATE art
      SET vote_count = GREATEST(0, vote_count - 1)
      WHERE id = v_art_uuid;
    END IF;
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'unvoted',
      'message', 'Vote removed',
      'vote_weight', v_vote_weight,
      'vote_factor', v_vote_weight,  -- Include for frontend display
      'weight_info', v_weight_info
    );
  ELSE
    -- Add new vote with calculated weight and art_uuid
    INSERT INTO votes (
      id,
      event_id,
      eid,
      round,
      easel,
      art_id,
      art_uuid,  -- Include art UUID
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
      v_art_uuid,  -- Store art UUID
      v_artist_profile_id,
      v_hash,
      v_auth_phone,
      v_person_id,
      v_vote_weight,
      NOW(),
      NOW(),
      NOW()
    );
    
    -- Update vote count if art_uuid exists
    IF v_art_uuid IS NOT NULL THEN
      UPDATE art
      SET vote_count = vote_count + 1
      WHERE id = v_art_uuid;
    END IF;
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'voted',
      'message', 'Vote registered successfully',
      'vote_weight', v_vote_weight,
      'vote_factor', v_vote_weight,  -- Include for frontend display
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