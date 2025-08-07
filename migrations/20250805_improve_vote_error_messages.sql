-- Improve error messages for voting, especially for round-based voting constraints

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
  v_existing_round_vote RECORD;
  v_artist_name TEXT;
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
  
  -- Get event, round, and artist info
  SELECT 
    a.event_id, 
    a.round,
    COALESCE(ap.name, 'Unknown Artist') as artist_name
  INTO v_event_id, v_round, v_artist_name
  FROM art a
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
  WHERE a.id = v_art_uuid;
  
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
  
  -- Check for existing vote on this specific artwork
  SELECT id INTO v_existing_vote_id
  FROM votes
  WHERE art_id = v_art_uuid
    AND person_id = v_person_id;
    
  -- Check if user already voted in this round (for a different artwork)
  SELECT 
    v.id,
    a.round,
    a.easel,
    ap.name as artist_name
  INTO v_existing_round_vote
  FROM votes v
  JOIN art a ON v.art_id = a.id
  LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
  WHERE v.person_id = v_person_id
    AND v.event_id = v_event_id
    AND a.round = v_round
    AND v.art_id != v_art_uuid
  LIMIT 1;
    
  IF v_existing_vote_id IS NOT NULL THEN
    -- User is clicking on the same artwork they already voted for - unvote
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
  ELSIF v_existing_round_vote.id IS NOT NULL THEN
    -- User already voted for a different artwork in this round
    RETURN jsonb_build_object(
      'success', false,
      'error', format('You already voted in Round %s for %s (Easel %s). You can only vote for one artwork per round.',
        v_round,
        v_existing_round_vote.artist_name,
        v_existing_round_vote.easel
      ),
      'already_voted_for', jsonb_build_object(
        'round', v_round,
        'artist', v_existing_round_vote.artist_name,
        'easel', v_existing_round_vote.easel
      )
    );
  ELSE
    -- Add new vote
    BEGIN
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
      
    EXCEPTION
      WHEN unique_violation THEN
        -- This catches any unique constraint violation
        RETURN jsonb_build_object(
          'success', false,
          'error', format('You have already voted in Round %s. You can only vote for one artwork per round.', v_round)
        );
      WHEN OTHERS THEN
        -- Any other error
        RAISE WARNING 'Unexpected error in voting: %', SQLERRM;
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Unable to process your vote. Please try again.',
          'detail', SQLERRM
        );
    END;
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