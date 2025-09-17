                                 pg_get_functiondef                                 
------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.ensure_person_exists(p_phone text)              +
  RETURNS uuid                                                                     +
  LANGUAGE plpgsql                                                                 +
 AS $function$                                                                     +
  DECLARE                                                                          +
    v_auth_user_id UUID;                                                           +
    v_person_id UUID;                                                              +
    v_person_hash TEXT;                                                            +
  BEGIN                                                                            +
    -- Get authenticated user                                                      +
    v_auth_user_id := auth.uid();                                                  +
                                                                                   +
    IF v_auth_user_id IS NULL THEN                                                 +
      RAISE EXCEPTION 'Not authenticated';                                         +
    END IF;                                                                        +
                                                                                   +
    -- Check if person already exists with this phone                              +
    SELECT id INTO v_person_id                                                     +
    FROM people                                                                    +
    WHERE                                                                          +
      phone = p_phone                                                              +
      OR phone = '+' || p_phone                                                    +
      OR phone = REPLACE(p_phone, '+', '')                                         +
      OR phone_number = p_phone                                                    +
      OR phone_number = '+' || p_phone                                             +
      OR phone_number = REPLACE(p_phone, '+', '')                                  +
    LIMIT 1;                                                                       +
                                                                                   +
    IF v_person_id IS NOT NULL THEN                                                +
      -- Person exists, just link them                                             +
      UPDATE people                                                                +
      SET                                                                          +
        auth_user_id = v_auth_user_id,                                             +
        auth_phone = p_phone,                                                      +
        updated_at = NOW()                                                         +
      WHERE id = v_person_id;                                                      +
                                                                                   +
      RETURN v_person_id;                                                          +
    END IF;                                                                        +
                                                                                   +
    -- Create new person record                                                    +
    v_person_id := gen_random_uuid();                                              +
    v_person_hash := encode(digest(v_person_id::text || p_phone, 'sha256'), 'hex');+
                                                                                   +
    INSERT INTO people (                                                           +
      id,                                                                          +
      phone,                                                                       +
      auth_user_id,                                                                +
      auth_phone,                                                                  +
      hash,                                                                        +
      name,                                                                        +
      type,                                                                        +
      created_at,                                                                  +
      updated_at                                                                   +
    ) VALUES (                                                                     +
      v_person_id,                                                                 +
      CASE WHEN p_phone LIKE '+%' THEN p_phone ELSE '+' || p_phone END,            +
      v_auth_user_id,                                                              +
      p_phone,                                                                     +
      v_person_hash,                                                               +
      'User',                                                                      +
      'guest',                                                                     +
      NOW(),                                                                       +
      NOW()                                                                        +
    );                                                                             +
                                                                                   +
    RETURN v_person_id;                                                            +
                                                                                   +
  EXCEPTION                                                                        +
    WHEN OTHERS THEN                                                               +
      RAISE WARNING 'Error in ensure_person_exists: %', SQLERRM;                   +
      RAISE;                                                                       +
  END;                                                                             +
  $function$                                                                       +
 
(1 row)

