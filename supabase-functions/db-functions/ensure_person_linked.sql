                                          pg_get_functiondef                                          
------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.ensure_person_linked(p_user_id uuid)                              +
  RETURNS uuid                                                                                       +
  LANGUAGE plpgsql                                                                                   +
 AS $function$                                                                                       +
 DECLARE                                                                                             +
   v_person_id UUID;                                                                                 +
   v_person_name TEXT;                                                                               +
   v_auth_phone TEXT;                                                                                +
   v_normalized_phone TEXT;                                                                          +
   v_user_meta JSONB;                                                                                +
 BEGIN                                                                                               +
   -- Get user info                                                                                  +
   SELECT phone, raw_user_meta_data                                                                  +
   INTO v_auth_phone, v_user_meta                                                                    +
   FROM auth.users                                                                                   +
   WHERE id = p_user_id;                                                                             +
                                                                                                     +
   -- Check if already linked                                                                        +
   SELECT id INTO v_person_id                                                                        +
   FROM people                                                                                       +
   WHERE auth_user_id = p_user_id;                                                                   +
                                                                                                     +
   IF v_person_id IS NOT NULL THEN                                                                   +
     RETURN v_person_id;                                                                             +
   END IF;                                                                                           +
                                                                                                     +
   -- Extract person_id from metadata (QR scan users)                                                +
   v_person_id := (v_user_meta->>'person_id')::uuid;                                                 +
   v_person_name := v_user_meta->>'person_name';                                                     +
                                                                                                     +
   IF v_person_id IS NOT NULL THEN                                                                   +
     -- QR scan user: Link existing person record                                                    +
     UPDATE people                                                                                   +
     SET                                                                                             +
       auth_user_id = p_user_id,                                                                     +
       nickname = COALESCE(v_person_name, nickname, 'User'),                                         +
       updated_at = NOW()                                                                            +
     WHERE id = v_person_id;                                                                         +
                                                                                                     +
     RETURN v_person_id;                                                                             +
   END IF;                                                                                           +
                                                                                                     +
   -- Direct OTP user: Find or create person                                                         +
   v_normalized_phone := v_auth_phone;                                                               +
   IF v_normalized_phone LIKE '+1%' THEN                                                             +
     v_normalized_phone := SUBSTRING(v_normalized_phone FROM 3);                                     +
   ELSIF v_normalized_phone LIKE '+%' THEN                                                           +
     v_normalized_phone := SUBSTRING(v_normalized_phone FROM 2);                                     +
   END IF;                                                                                           +
                                                                                                     +
   -- Try to find existing person with matching phone                                                +
   SELECT id, name INTO v_person_id, v_person_name                                                   +
   FROM people                                                                                       +
   WHERE auth_user_id IS NULL                                                                        +
     AND (                                                                                           +
       phone = '+1' || v_normalized_phone                                                            +
       OR phone = '+' || v_normalized_phone                                                          +
       OR phone = v_normalized_phone                                                                 +
       OR phone = v_auth_phone                                                                       +
       OR REPLACE(REPLACE(phone, '+1', ''), '+', '') = v_normalized_phone                            +
     )                                                                                               +
   ORDER BY created_at DESC                                                                          +
   LIMIT 1;                                                                                          +
                                                                                                     +
   IF v_person_id IS NOT NULL THEN                                                                   +
     -- Link existing person                                                                         +
     UPDATE people                                                                                   +
     SET                                                                                             +
       auth_user_id = p_user_id,                                                                     +
       updated_at = NOW()                                                                            +
     WHERE id = v_person_id;                                                                         +
   ELSE                                                                                              +
     -- Create new person                                                                            +
     v_person_id := gen_random_uuid();                                                               +
     v_person_name := 'User';                                                                        +
                                                                                                     +
     INSERT INTO people (                                                                            +
       id, phone, name, nickname, auth_user_id, created_at, updated_at                               +
     ) VALUES (                                                                                      +
       v_person_id, '+1' || v_normalized_phone, v_person_name, v_person_name, p_user_id, NOW(), NOW()+
     );                                                                                              +
   END IF;                                                                                           +
                                                                                                     +
   RETURN v_person_id;                                                                               +
 END;                                                                                                +
 $function$                                                                                          +
 
(1 row)

