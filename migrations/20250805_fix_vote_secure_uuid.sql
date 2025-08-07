-- Update cast_vote_secure to accept UUID directly instead of art_code

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
  
  -- Check for existing vote
  SELECT id INTO v_existing_vote_id
  FROM votes
  WHERE art_id = v_art_uuid
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
      'message', 'Vote removed'
    );
  ELSE
    -- Add new vote
    INSERT INTO votes (
      id,
      art_id,
      person_id,
      event_id,
      round,
      auth_method,
      auth_timestamp,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_art_uuid,
      v_person_id,
      v_event_id,
      v_round,
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
          'phone_last4', RIGHT(v_auth_phone, 4)
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
      'message', 'Vote registered successfully'
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