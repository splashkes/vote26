-- Create functions to link person records with auth users at login time
-- This fixes the "user account not properly set up" error

CREATE OR REPLACE FUNCTION refresh_auth_metadata()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auth_user_id UUID;
  v_auth_phone TEXT;
  v_person_id UUID;
  v_person_hash TEXT;
  v_person_name TEXT;
  v_auth_metadata JSONB;
BEGIN
  -- Get authenticated user
  v_auth_user_id := auth.uid();
  
  IF v_auth_user_id IS NULL THEN
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
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No phone number found in auth record'
    );
  END IF;

  -- Try to find existing person record with matching phone
  -- Handle various phone formats: with/without +, in phone or phone_number columns
  SELECT id, hash, name INTO v_person_id, v_person_hash, v_person_name
  FROM people
  WHERE auth_user_id IS NULL  -- Not already linked
    AND (
      -- Match in phone column (usually has + prefix)
      phone = v_auth_phone 
      OR phone = '+' || v_auth_phone
      OR phone = REPLACE(v_auth_phone, '+', '')
      -- Match in phone_number column (backup column)  
      OR phone_number = v_auth_phone
      OR phone_number = '+' || v_auth_phone
      OR phone_number = REPLACE(v_auth_phone, '+', '')
      -- Handle case where auth phone has + but people phone doesn't
      OR (v_auth_phone LIKE '+%' AND phone = SUBSTRING(v_auth_phone FROM 2))
      OR (v_auth_phone LIKE '+%' AND phone_number = SUBSTRING(v_auth_phone FROM 2))
    )
  ORDER BY created_at DESC  -- Use most recent if multiple matches
  LIMIT 1;

  IF v_person_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Person not found',
      'auth_phone', v_auth_phone
    );
  END IF;

  -- Link the person record to the auth user
  UPDATE people
  SET
    auth_user_id = v_auth_user_id,
    auth_phone = v_auth_phone,
    updated_at = NOW()
  WHERE id = v_person_id;

  -- Generate hash if it doesn't exist
  IF v_person_hash IS NULL THEN
    v_person_hash := encode(digest(v_person_id::text || COALESCE(v_auth_phone, ''), 'sha256'), 'hex');
    UPDATE people 
    SET hash = v_person_hash
    WHERE id = v_person_id;
  END IF;

  -- Update auth user metadata
  v_auth_metadata := jsonb_build_object(
    'person_id', v_person_id,
    'person_hash', v_person_hash,
    'person_name', COALESCE(v_person_name, 'User')
  );

  -- Update auth.users metadata (requires service role privileges)
  UPDATE auth.users
  SET 
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || v_auth_metadata,
    updated_at = NOW()
  WHERE id = v_auth_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'person_id', v_person_id,
    'person_hash', v_person_hash,
    'person_name', COALESCE(v_person_name, 'User'),
    'linked_phone', v_auth_phone
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in refresh_auth_metadata: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'auth_user_id', v_auth_user_id,
      'auth_phone', v_auth_phone
    );
END;
$$;

CREATE OR REPLACE FUNCTION ensure_person_exists(p_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auth_user_id UUID;
  v_person_id UUID;
  v_person_hash TEXT;
BEGIN
  -- Get authenticated user
  v_auth_user_id := auth.uid();
  
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if person already exists with this phone
  SELECT id INTO v_person_id
  FROM people
  WHERE 
    phone = p_phone 
    OR phone = '+' || p_phone
    OR phone = REPLACE(p_phone, '+', '')
    OR phone_number = p_phone
    OR phone_number = '+' || p_phone  
    OR phone_number = REPLACE(p_phone, '+', '')
  LIMIT 1;

  IF v_person_id IS NOT NULL THEN
    -- Person exists, just link them
    UPDATE people
    SET
      auth_user_id = v_auth_user_id,
      auth_phone = p_phone,
      updated_at = NOW()
    WHERE id = v_person_id;
    
    RETURN v_person_id;
  END IF;

  -- Create new person record
  v_person_id := gen_random_uuid();
  v_person_hash := encode(digest(v_person_id::text || p_phone, 'sha256'), 'hex');

  INSERT INTO people (
    id,
    phone,
    auth_user_id,
    auth_phone,
    hash,
    name,
    type,
    created_at,
    updated_at
  ) VALUES (
    v_person_id,
    CASE WHEN p_phone LIKE '+%' THEN p_phone ELSE '+' || p_phone END,
    v_auth_user_id,
    p_phone,
    v_person_hash,
    'User',
    'guest',
    NOW(),
    NOW()
  );

  RETURN v_person_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in ensure_person_exists: %', SQLERRM;
    RAISE;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION refresh_auth_metadata() TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_person_exists(text) TO authenticated;