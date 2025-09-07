-- Remove raw_user_meta_data dependencies from cast_vote_secure
-- Make it purely auth-first: auth.uid() -> people.auth_user_id lookup

CREATE OR REPLACE FUNCTION public.cast_vote_secure(p_eid character varying, p_round integer, p_easel integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_auth_user_id UUID;
  v_person_id UUID;
  v_event_id UUID;
  v_art_uuid UUID;
  v_existing_vote_id UUID;
  v_vote_weight NUMERIC(4,2);
  v_weight_info JSONB;
  v_qr_bonus NUMERIC(4,2) := 0.0;
  v_has_qr_scan BOOLEAN := false;
  v_final_weight NUMERIC(4,2);
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

  -- Get person record - AUTH-FIRST APPROACH (no metadata needed)
  SELECT id INTO v_person_id
  FROM people
  WHERE auth_user_id = v_auth_user_id;

  IF v_person_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User profile not found - please complete phone verification',
      'auth_user_id', v_auth_user_id
    );
  END IF;

  -- Construct art_id from eid-round-easel
  v_art_id := p_eid || '-' || p_round || '-' || p_easel;

  -- Get existing vote weight from materialized view
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

  -- Check for existing vote using art_uuid
  SELECT id INTO v_existing_vote_id
  FROM votes
  WHERE art_uuid = v_art_uuid
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
      'vote_weight', v_final_weight,
      'weight_info', v_weight_info
    );
  ELSE
    -- Add new vote with calculated weight (including QR bonus)
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
      v_final_weight,
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
$function$;

-- Add comment
COMMENT ON FUNCTION cast_vote_secure(character varying, integer, integer) IS 'Cast vote with auth-first approach - no metadata dependencies';

SELECT 'cast_vote_secure updated - removed raw_user_meta_data dependencies' AS status;