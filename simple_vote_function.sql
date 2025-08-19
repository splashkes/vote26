-- Create simplified vote function without complex weight calculation
CREATE OR REPLACE FUNCTION cast_vote_secure(
  p_eid VARCHAR(20),
  p_round INT,
  p_easel INT
) RETURNS JSONB AS $$
DECLARE
  v_auth_user_id UUID;
  v_person_id UUID;
  v_event_id UUID;
  v_art_uuid UUID;
  v_existing_vote_id UUID;
  v_auth_phone TEXT;
  v_auth_metadata JSONB;
  v_nickname TEXT;
  v_art_id VARCHAR(50);
BEGIN
  -- Get authenticated user
  v_auth_user_id := auth.uid();
  
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;
  
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
  
  -- Get art_uuid from art table
  SELECT id INTO v_art_uuid
  FROM art
  WHERE event_id = v_event_id
    AND round = p_round
    AND easel = p_easel;
  
  IF v_art_uuid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Artwork not found'
    );
  END IF;
  
  -- Construct art_id from eid-round-easel
  v_art_id := p_eid || '-' || p_round || '-' || p_easel;
  
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
  END IF;
  
  -- Check for existing vote using EID/round/easel (avoiding UUID comparison)
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
    
    -- Update vote count
    UPDATE art
    SET vote_count = GREATEST(0, vote_count - 1)
    WHERE id = v_art_uuid;
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'unvoted',
      'message', 'Vote removed',
      'vote_weight', 1.0
    );
  ELSE
    -- Add new vote with simple weight (NO COMPLEX WEIGHT CALCULATION)
    INSERT INTO votes (
      id,
      event_id,
      eid,
      round,
      easel,
      art_id,
      art_uuid,
      person_id,
      vote_factor,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_event_id,
      p_eid,
      p_round,
      p_easel,
      v_art_id,
      v_art_uuid,
      v_person_id,
      1.0,  -- Simple weight
      NOW()
    );
    
    -- Update vote count
    UPDATE art
    SET vote_count = vote_count + 1
    WHERE id = v_art_uuid;
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'voted',
      'message', 'Vote registered successfully',
      'vote_weight', 1.0
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

GRANT EXECUTE ON FUNCTION cast_vote_secure(VARCHAR, INT, INT) TO authenticated;