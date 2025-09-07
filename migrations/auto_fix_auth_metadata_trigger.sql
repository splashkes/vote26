-- Auto-Fix Auth Metadata Trigger
-- Automatically fixes missing auth metadata when users try to vote/bid
-- Prevents "Please sign in to vote" errors in real-time

-- Create a function that auto-fixes auth metadata for a single user
CREATE OR REPLACE FUNCTION auto_fix_user_auth_metadata()
RETURNS TRIGGER AS $$
DECLARE
    v_person_record RECORD;
    v_person_hash TEXT;
BEGIN
    -- Only process INSERT operations on people table where auth_user_id is being linked
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.auth_user_id IS NULL AND NEW.auth_user_id IS NOT NULL) THEN
        
        -- Get the person record details
        SELECT id, name, nickname, hash INTO v_person_record
        FROM people 
        WHERE id = NEW.id;
        
        -- Generate hash if missing
        IF v_person_record.hash IS NULL THEN
            v_person_hash := encode(sha256((v_person_record.id::text || COALESCE(NEW.phone, ''))::bytea), 'hex');
            
            -- Update the hash in the people record
            UPDATE people 
            SET hash = v_person_hash 
            WHERE id = NEW.id;
        ELSE
            v_person_hash := v_person_record.hash;
        END IF;
        
        -- Update auth metadata immediately using direct SQL
        UPDATE auth.users 
        SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
            'person_id', NEW.id::text,
            'person_hash', v_person_hash,
            'person_name', COALESCE(v_person_record.name, v_person_record.nickname, 'User')
        )
        WHERE id = NEW.auth_user_id;
        
        
        RAISE NOTICE 'Auto-fixed auth metadata for user: % -> person: %', NEW.auth_user_id, NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on people table to auto-fix metadata when auth_user_id is linked
DROP TRIGGER IF EXISTS trigger_auto_fix_auth_metadata ON people;

CREATE TRIGGER trigger_auto_fix_auth_metadata
    AFTER INSERT OR UPDATE ON people
    FOR EACH ROW
    WHEN (NEW.auth_user_id IS NOT NULL)
    EXECUTE FUNCTION auto_fix_user_auth_metadata();

-- Create a function that can be called from cast_vote_secure to emergency-fix users
CREATE OR REPLACE FUNCTION emergency_fix_single_user_metadata(
    user_id UUID,
    person_id UUID DEFAULT NULL,
    person_hash TEXT DEFAULT NULL,
    person_name TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_person_id UUID;
    v_person_hash TEXT;
    v_person_name TEXT;
BEGIN
    -- If person details not provided, look them up
    IF person_id IS NULL THEN
        SELECT p.id, p.hash, COALESCE(p.name, p.nickname, 'User')
        INTO v_person_id, v_person_hash, v_person_name
        FROM people p
        WHERE p.auth_user_id = user_id;
        
        IF v_person_id IS NULL THEN
            RETURN FALSE; -- Can't fix if no person record exists
        END IF;
    ELSE
        v_person_id := person_id;
        v_person_hash := person_hash;
        v_person_name := person_name;
    END IF;
    
    -- Generate hash if missing
    IF v_person_hash IS NULL THEN
        SELECT encode(sha256((v_person_id::text || COALESCE(phone, ''))::bytea), 'hex')
        INTO v_person_hash
        FROM people WHERE id = v_person_id;
    END IF;
    
    -- Fix auth metadata (only raw_user_meta_data exists in Supabase)
    UPDATE auth.users 
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'person_id', v_person_id::text,
        'person_hash', v_person_hash,
        'person_name', v_person_name
    )
    WHERE id = user_id;
    
    RAISE NOTICE 'Emergency fixed auth metadata for user: % -> person: %', user_id, v_person_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update cast_vote_secure to auto-fix metadata when missing
CREATE OR REPLACE FUNCTION cast_vote_secure(p_eid character varying, p_round integer, p_easel integer)
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
  v_auth_phone TEXT;
  v_auth_metadata JSONB;
  v_nickname TEXT;
  v_vote_weight NUMERIC(4,2);
  v_weight_info JSONB;
  v_qr_bonus NUMERIC(4,2) := 0.0;
  v_has_qr_scan BOOLEAN := false;
  v_final_weight NUMERIC(4,2);
  v_art_id VARCHAR(50);
  v_metadata_fixed BOOLEAN := false;
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

  -- Get person record with AUTOMATIC METADATA FIX
  SELECT id INTO v_person_id
  FROM people
  WHERE auth_user_id = v_auth_user_id;

  IF v_person_id IS NULL THEN
    -- EMERGENCY FIX: Try to auto-create/link person record like bidding does
    PERFORM emergency_fix_unlinked_users();
    
    -- Try again after emergency fix
    SELECT id INTO v_person_id
    FROM people
    WHERE auth_user_id = v_auth_user_id;
    
    IF v_person_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'User registration incomplete - person record not found'
      );
    END IF;
    
    v_metadata_fixed := true;
  END IF;

  -- AUTO-FIX: Check if auth metadata is missing and fix it
  SELECT raw_user_meta_data INTO v_auth_metadata
  FROM auth.users
  WHERE id = v_auth_user_id;
  
  IF v_auth_metadata->>'person_id' IS NULL OR v_auth_metadata->>'person_id' != v_person_id::text THEN
    PERFORM emergency_fix_single_user_metadata(v_auth_user_id, v_person_id);
    v_metadata_fixed := true;
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

  -- Add QR info and metadata fix info to weight info
  v_weight_info := v_weight_info || jsonb_build_object(
    'qr_bonus', v_qr_bonus,
    'has_qr_scan', v_has_qr_scan,
    'final_weight', v_final_weight,
    'metadata_fixed', v_metadata_fixed
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
COMMENT ON FUNCTION auto_fix_user_auth_metadata() IS 'Automatically fixes auth metadata when person records are linked to auth users';
COMMENT ON FUNCTION emergency_fix_single_user_metadata(UUID, UUID, TEXT, TEXT) IS 'Emergency fix for single user auth metadata';
COMMENT ON TRIGGER trigger_auto_fix_auth_metadata ON people IS 'Auto-fixes auth metadata when person gets linked to auth user';

SELECT 'Auto-fix auth metadata system installed successfully' AS status;