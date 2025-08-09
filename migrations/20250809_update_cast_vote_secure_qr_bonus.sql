-- Update cast_vote_secure function to include QR bonus
-- Adds QR scan bonus to existing vote weight calculation without modifying the base system

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
  v_qr_bonus NUMERIC(4,2) := 0.0;
  v_has_qr_scan BOOLEAN := false;
  v_final_weight NUMERIC(4,2);
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
  
  -- Get existing vote weight from materialized view (unchanged)
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
  
  -- Check for valid QR scan for this specific event
  SELECT has_valid_qr_scan(v_person_id, v_event_id) INTO v_has_qr_scan;
  
  -- Apply QR bonus if valid scan exists
  IF v_has_qr_scan THEN
    v_qr_bonus := 1.0;
  END IF;
  
  -- Calculate final vote weight (existing weight + QR bonus)
  v_final_weight := v_vote_weight + v_qr_bonus;
  
  -- Add QR info to weight info
  v_weight_info := v_weight_info || jsonb_build_object(
    'qr_bonus', v_qr_bonus,
    'has_qr_scan', v_has_qr_scan,
    'final_weight', v_final_weight
  );
  
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
      'vote_weight', v_final_weight,
      'weight_info', v_weight_info
    );
  ELSE
    -- Add new vote with calculated weight (including QR bonus)
    INSERT INTO votes (
      id,
      art_id,
      person_id,
      event_id,
      round,
      vote_factor,  -- Store the final weight (existing + QR bonus)
      auth_method,
      auth_timestamp,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_art_uuid,
      v_person_id,
      v_event_id,
      v_round,
      v_final_weight,  -- Use final weight including QR bonus
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
          'vote_weight', v_final_weight,
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
      'vote_weight', v_final_weight,
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

-- Ensure permissions remain the same
GRANT EXECUTE ON FUNCTION cast_vote_secure(TEXT) TO authenticated;

-- Add comment explaining the QR integration
COMMENT ON FUNCTION cast_vote_secure IS 
'Cast vote with weight calculation including QR bonus.
- Gets existing vote weight from person_vote_weights materialized view
- Checks for valid QR scans for the specific event being voted on
- Adds 1.0x bonus if valid QR scan exists for this event
- Applies combined weight to the vote_factor field';