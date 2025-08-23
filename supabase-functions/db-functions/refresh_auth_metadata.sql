                                             pg_get_functiondef                                             
------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.refresh_auth_metadata()                                                 +
  RETURNS jsonb                                                                                            +
  LANGUAGE plpgsql                                                                                         +
  SECURITY DEFINER                                                                                         +
  SET search_path TO 'public', 'auth'                                                                      +
 AS $function$                                                                                             +
 DECLARE                                                                                                   +
   v_auth_user_id UUID;                                                                                    +
   v_auth_phone TEXT;                                                                                      +
   v_person_id UUID;                                                                                       +
   v_person_hash TEXT;                                                                                     +
   v_person_name TEXT;                                                                                     +
   v_auth_metadata JSONB;                                                                                  +
   v_normalized_phone TEXT;                                                                                +
 BEGIN                                                                                                     +
   -- Get authenticated user                                                                               +
   v_auth_user_id := auth.uid();                                                                           +
                                                                                                           +
   IF v_auth_user_id IS NULL THEN                                                                          +
     RETURN jsonb_build_object(                                                                            +
       'success', false,                                                                                   +
       'error', 'Not authenticated'                                                                        +
     );                                                                                                    +
   END IF;                                                                                                 +
                                                                                                           +
   -- Get user's phone from auth.users table                                                               +
   SELECT phone INTO v_auth_phone                                                                          +
   FROM auth.users                                                                                         +
   WHERE id = v_auth_user_id;                                                                              +
                                                                                                           +
   IF v_auth_phone IS NULL THEN                                                                            +
     RETURN jsonb_build_object(                                                                            +
       'success', false,                                                                                   +
       'error', 'No phone number found in auth record'                                                     +
     );                                                                                                    +
   END IF;                                                                                                 +
                                                                                                           +
   -- Normalize phone number for better matching                                                           +
   v_normalized_phone := v_auth_phone;                                                                     +
   -- Remove +1 prefix if it exists                                                                        +
   IF v_normalized_phone LIKE '+1%' THEN                                                                   +
     v_normalized_phone := SUBSTRING(v_normalized_phone FROM 3);                                           +
   END IF;                                                                                                 +
   -- Remove + prefix if it exists                                                                         +
   IF v_normalized_phone LIKE '+%' THEN                                                                    +
     v_normalized_phone := SUBSTRING(v_normalized_phone FROM 2);                                           +
   END IF;                                                                                                 +
                                                                                                           +
   -- Try to find existing person record with matching phone                                               +
   SELECT id, hash, name INTO v_person_id, v_person_hash, v_person_name                                    +
   FROM people                                                                                             +
   WHERE auth_user_id IS NULL  -- Not already linked                                                       +
     AND (                                                                                                 +
       phone = v_auth_phone                                                                                +
       OR phone = '+' || v_auth_phone                                                                      +
       OR phone = '+1' || v_auth_phone                                                                     +
       OR phone = '+1' || v_normalized_phone                                                               +
       OR phone = '+' || v_normalized_phone                                                                +
       OR phone = v_normalized_phone                                                                       +
       OR phone_number = v_auth_phone                                                                      +
       OR phone_number = '+' || v_auth_phone                                                               +
       OR phone_number = '+1' || v_auth_phone                                                              +
       OR phone_number = '+1' || v_normalized_phone                                                        +
       OR phone_number = '+' || v_normalized_phone                                                         +
       OR phone_number = v_normalized_phone                                                                +
       OR REPLACE(REPLACE(phone, '+1', ''), '+', '') = v_normalized_phone                                  +
       OR REPLACE(REPLACE(phone_number, '+1', ''), '+', '') = v_normalized_phone                           +
     )                                                                                                     +
   ORDER BY created_at DESC                                                                                +
   LIMIT 1;                                                                                                +
                                                                                                           +
   IF v_person_id IS NOT NULL THEN                                                                         +
     -- Link existing person record                                                                        +
     UPDATE people                                                                                         +
     SET                                                                                                   +
       auth_user_id = v_auth_user_id,                                                                      +
       auth_phone = v_auth_phone,                                                                          +
       verified = true,                                                                                    +
       updated_at = NOW()                                                                                  +
     WHERE id = v_person_id;                                                                               +
                                                                                                           +
     IF v_person_hash IS NULL THEN                                                                         +
       v_person_hash := encode(digest((v_person_id::text || COALESCE(v_auth_phone, '')), 'sha256'), 'hex');+
       UPDATE people                                                                                       +
       SET hash = v_person_hash                                                                            +
       WHERE id = v_person_id;                                                                             +
     END IF;                                                                                               +
   ELSE                                                                                                    +
     -- Create new person for direct OTP signup                                                            +
     v_person_id := gen_random_uuid();                                                                     +
     v_person_name := 'User';                                                                              +
                                                                                                           +
     -- Generate hash using proper syntax                                                                  +
     v_person_hash := encode(digest((v_person_id::text || COALESCE(v_auth_phone, '')), 'sha256'), 'hex');  +
                                                                                                           +
     -- Create new person record                                                                           +
     INSERT INTO people (                                                                                  +
       id,                                                                                                 +
       phone,                                                                                              +
       name,                                                                                               +
       nickname,                                                                                           +
       hash,                                                                                               +
       auth_user_id,                                                                                       +
       auth_phone,                                                                                         +
       verified,                                                                                           +
       created_at,                                                                                         +
       updated_at                                                                                          +
     ) VALUES (                                                                                            +
       v_person_id,                                                                                        +
       '+1' || v_normalized_phone,                                                                         +
       v_person_name,                                                                                      +
       v_person_name,                                                                                      +
       v_person_hash,                                                                                      +
       v_auth_user_id,                                                                                     +
       v_auth_phone,                                                                                       +
       true,                                                                                               +
       NOW(),                                                                                              +
       NOW()                                                                                               +
     );                                                                                                    +
   END IF;                                                                                                 +
                                                                                                           +
   -- Update auth user metadata                                                                            +
   v_auth_metadata := jsonb_build_object(                                                                  +
     'person_id', v_person_id,                                                                             +
     'person_hash', v_person_hash,                                                                         +
     'person_name', COALESCE(v_person_name, 'User')                                                        +
   );                                                                                                      +
                                                                                                           +
   UPDATE auth.users                                                                                       +
   SET                                                                                                     +
     raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || v_auth_metadata,                    +
     updated_at = NOW()                                                                                    +
   WHERE id = v_auth_user_id;                                                                              +
                                                                                                           +
   RETURN jsonb_build_object(                                                                              +
     'success', true,                                                                                      +
     'person_id', v_person_id,                                                                             +
     'person_hash', v_person_hash,                                                                         +
     'person_name', COALESCE(v_person_name, 'User'),                                                       +
     'linked_phone', v_auth_phone,                                                                         +
     'action', CASE WHEN v_person_name = 'User' THEN 'created_new_person' ELSE 'linked_existing_person' END+
   );                                                                                                      +
                                                                                                           +
 EXCEPTION                                                                                                 +
   WHEN OTHERS THEN                                                                                        +
     RETURN jsonb_build_object(                                                                            +
       'success', false,                                                                                   +
       'error', SQLERRM,                                                                                   +
       'auth_user_id', v_auth_user_id,                                                                     +
       'auth_phone', v_auth_phone                                                                          +
     );                                                                                                    +
 END;                                                                                                      +
 $function$                                                                                                +
 
(1 row)

