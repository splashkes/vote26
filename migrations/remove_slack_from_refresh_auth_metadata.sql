-- Remove all Slack notifications from refresh_auth_metadata function to fix 10+ second token refresh delays
-- Slack API calls were causing synchronous delays during every token refresh

CREATE OR REPLACE FUNCTION public.refresh_auth_metadata()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
DECLARE
  v_auth_user_id UUID;
  v_auth_phone TEXT;
  v_person_id UUID;
  v_person_hash TEXT;
  v_person_name TEXT;
  v_auth_metadata JSONB;
  v_normalized_phone TEXT;
  v_start_time TIMESTAMP;
  v_duration_ms INTEGER;
  v_log_metadata JSONB;
  v_operation_result TEXT;
BEGIN
  v_start_time := clock_timestamp();

  -- Get authenticated user
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    PERFORM log_artist_auth(
      NULL, NULL, NULL,
      'metadata_refresh', 'refresh_auth_metadata',
      false, 'not_authenticated', 'No authenticated user found'
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- Get user's phone from auth.users table
  SELECT phone INTO v_auth_phone
  FROM auth.users
  WHERE id = v_auth_user_id;

  IF v_auth_phone IS NULL THEN
    PERFORM log_artist_auth(
      v_auth_user_id, NULL, NULL,
      'metadata_refresh', 'refresh_auth_metadata',
      false, 'phone_missing', 'No phone number found in auth record'
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'No phone number found in auth record'
    );
  END IF;

  -- Normalize phone number for better matching
  v_normalized_phone := v_auth_phone;
  -- Remove +1 prefix if it exists
  IF v_normalized_phone LIKE '+1%' THEN
    v_normalized_phone := SUBSTRING(v_normalized_phone FROM 3);
  END IF;
  -- Remove + prefix if it exists
  IF v_normalized_phone LIKE '+%' THEN
    v_normalized_phone := SUBSTRING(v_normalized_phone FROM 2);
  END IF;

  -- Log the person lookup attempt
  v_log_metadata := jsonb_build_object(
    'auth_phone', v_auth_phone,
    'normalized_phone', v_normalized_phone,
    'lookup_strategy', 'phone_matching'
  );

  -- Try to find existing person record
  SELECT id, hash, name INTO v_person_id, v_person_hash, v_person_name
  FROM people
  WHERE (auth_user_id = v_auth_user_id OR auth_user_id IS NULL)
    AND (
      phone = v_auth_phone
      OR phone = '+' || v_auth_phone
      OR phone = '+1' || v_auth_phone
      OR phone = '+1' || v_normalized_phone
      OR phone = '+' || v_normalized_phone
      OR phone = v_normalized_phone
      OR phone_number = v_auth_phone
      OR phone_number = '+' || v_auth_phone
      OR phone_number = '+1' || v_auth_phone
      OR phone_number = '+1' || v_normalized_phone
      OR phone_number = '+' || v_normalized_phone
      OR phone_number = v_normalized_phone
      OR REPLACE(REPLACE(phone, '+1', ''), '+', '') = v_normalized_phone
      OR REPLACE(REPLACE(phone_number, '+1', ''), '+', '') = v_normalized_phone
    )
  ORDER BY
    CASE WHEN auth_user_id = v_auth_user_id THEN 0 ELSE 1 END,
    created_at DESC
  LIMIT 1;

  IF v_person_id IS NOT NULL THEN
    -- Found existing person record
    v_operation_result := 'person_found_and_linked';

    -- Link existing person record
    UPDATE people
    SET
      auth_user_id = v_auth_user_id,
      auth_phone = v_auth_phone,
      verified = true,
      updated_at = NOW()
    WHERE id = v_person_id;

    IF v_person_hash IS NULL THEN
      -- Fix: Cast both parameters to text explicitly
      v_person_hash := encode(digest((v_person_id::text || COALESCE(v_auth_phone, ''))::text, 'sha256'::text), 'hex');
      UPDATE people
      SET hash = v_person_hash
      WHERE id = v_person_id;
    END IF;

    v_log_metadata := v_log_metadata || jsonb_build_object(
      'person_found', true,
      'person_was_linked', CASE WHEN v_person_name <> 'User' THEN true ELSE false END,
      'person_name', v_person_name
    );

  ELSE
    -- Create new person for direct OTP signup
    v_operation_result := 'person_created_new';
    v_person_id := gen_random_uuid();
    v_person_name := 'User';

    -- Generate hash with explicit text casting
    v_person_hash := encode(digest((v_person_id::text || COALESCE(v_auth_phone, ''))::text, 'sha256'::text), 'hex');

    -- Create new person record
    INSERT INTO people (
      id,
      phone,
      name,
      nickname,
      hash,
      auth_user_id,
      auth_phone,
      verified,
      created_at,
      updated_at
    ) VALUES (
      v_person_id,
      '+1' || v_normalized_phone,
      v_person_name,
      v_person_name,
      v_person_hash,
      v_auth_user_id,
      v_auth_phone,
      true,
      NOW(),
      NOW()
    );

    v_log_metadata := v_log_metadata || jsonb_build_object(
      'person_found', false,
      'person_created', true,
      'new_person_phone', '+1' || v_normalized_phone
    );
  END IF;

  -- Update auth user metadata
  v_auth_metadata := jsonb_build_object(
    'person_id', v_person_id,
    'person_hash', v_person_hash,
    'person_name', COALESCE(v_person_name, 'User')
  );

  UPDATE auth.users
  SET
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || v_auth_metadata,
    updated_at = NOW()
  WHERE id = v_auth_user_id;

  -- Calculate duration
  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;

  -- Log successful operation
  v_log_metadata := v_log_metadata || jsonb_build_object(
    'operation_result', v_operation_result,
    'metadata_updated', true
  );

  PERFORM log_artist_auth(
    v_auth_user_id, v_person_id, v_auth_phone,
    'metadata_refresh', 'refresh_auth_metadata',
    true, NULL, NULL, v_duration_ms, v_log_metadata
  );

  RETURN jsonb_build_object(
    'success', true,
    'person_id', v_person_id,
    'person_hash', v_person_hash,
    'person_name', COALESCE(v_person_name, 'User'),
    'linked_phone', v_auth_phone,
    'action', CASE WHEN v_person_name = 'User' THEN 'created_new_person' ELSE 'linked_existing_person' END
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Calculate duration even on error
    v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;

    -- Log the error
    PERFORM log_artist_auth(
      v_auth_user_id, v_person_id, v_auth_phone,
      'metadata_refresh', 'refresh_auth_metadata',
      false, 'database_error', SQLERRM, v_duration_ms,
      jsonb_build_object('sql_error', SQLERRM, 'sql_state', SQLSTATE)
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'auth_user_id', v_auth_user_id,
      'auth_phone', v_auth_phone
    );
END;
$function$;