                                          pg_get_functiondef                                           
-------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.link_person_on_phone_verification()                                +
  RETURNS trigger                                                                                     +
  LANGUAGE plpgsql                                                                                    +
  SECURITY DEFINER                                                                                    +
 AS $function$                                                                                        +
 DECLARE                                                                                              +
   v_person_id UUID;                                                                                  +
   v_person_name TEXT;                                                                                +
   v_auth_phone TEXT;                                                                                 +
   v_normalized_phone TEXT;                                                                           +
   v_existing_auth_user UUID;                                                                         +
 BEGIN                                                                                                +
   -- Only process when phone_confirmed_at changes from NULL to a timestamp                           +
   IF OLD.phone_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NULL THEN                       +
     RETURN NEW;                                                                                      +
   END IF;                                                                                            +
                                                                                                      +
   -- Extract person_id from metadata (QR scan users)                                                 +
   v_person_id := (NEW.raw_user_meta_data->>'person_id')::uuid;                                       +
   v_person_name := NEW.raw_user_meta_data->>'person_name';                                           +
   v_auth_phone := NEW.phone;                                                                         +
                                                                                                      +
   IF v_person_id IS NOT NULL THEN                                                                    +
     -- QR scan user: Link existing person record                                                     +
     UPDATE people                                                                                    +
     SET                                                                                              +
       auth_user_id = NEW.id,                                                                         +
       verified = true,                                                                               +
       nickname = COALESCE(v_person_name, nickname, 'User'),                                          +
       updated_at = NOW()                                                                             +
     WHERE id = v_person_id;                                                                          +
   ELSE                                                                                               +
     -- Direct OTP user: Try to find existing person or create new one                                +
     -- Normalize auth phone for matching (remove +1 prefix if exists)                                +
     v_normalized_phone := v_auth_phone;                                                              +
     IF v_normalized_phone LIKE '+1%' THEN                                                            +
       v_normalized_phone := SUBSTRING(v_normalized_phone FROM 3);                                    +
     ELSIF v_normalized_phone LIKE '+%' THEN                                                          +
       v_normalized_phone := SUBSTRING(v_normalized_phone FROM 2);                                    +
     END IF;                                                                                          +
                                                                                                      +
     -- Try to find existing person with matching phone (REMOVED auth_user_id IS NULL constraint)     +
     SELECT id, name, auth_user_id INTO v_person_id, v_person_name, v_existing_auth_user              +
     FROM people                                                                                      +
     WHERE (                                                                                          +
         -- People table usually has +1 format, auth.users has numeric                                +
         phone = '+1' || v_normalized_phone                                                           +
         OR phone = '+' || v_normalized_phone                                                         +
         OR phone = v_normalized_phone                                                                +
         OR phone = v_auth_phone                                                                      +
         OR phone_number = '+1' || v_normalized_phone                                                 +
         OR phone_number = '+' || v_normalized_phone                                                  +
         OR phone_number = v_normalized_phone                                                         +
         OR phone_number = v_auth_phone                                                               +
         -- Handle reverse cases                                                                      +
         OR REPLACE(REPLACE(phone, '+1', ''), '+', '') = v_normalized_phone                           +
         OR REPLACE(REPLACE(phone_number, '+1', ''), '+', '') = v_normalized_phone                    +
       )                                                                                              +
       AND (name IS NOT NULL AND name != '' AND name != 'User') -- Prioritize records with actual data+
     ORDER BY                                                                                         +
       CASE WHEN auth_user_id IS NULL THEN 1 ELSE 2 END, -- Prefer unlinked records first             +
       created_at DESC                                                                                +
     LIMIT 1;                                                                                         +
                                                                                                      +
     IF v_person_id IS NOT NULL THEN                                                                  +
       -- Check if this person is already linked to a different auth user                             +
       IF v_existing_auth_user IS NOT NULL AND v_existing_auth_user != NEW.id THEN                    +
         -- Unlink the old auth user first (they'll get an empty record if needed)                    +
         UPDATE people SET auth_user_id = NULL WHERE auth_user_id = v_existing_auth_user;             +
       END IF;                                                                                        +
                                                                                                      +
       -- Link existing person to new auth user                                                       +
       UPDATE people                                                                                  +
       SET                                                                                            +
         auth_user_id = NEW.id,                                                                       +
         verified = true,                                                                             +
         updated_at = NOW()                                                                           +
       WHERE id = v_person_id;                                                                        +
     ELSE                                                                                             +
       -- Create new person for direct OTP signup                                                     +
       v_person_id := gen_random_uuid();                                                              +
       v_person_name := 'User';                                                                       +
                                                                                                      +
       INSERT INTO people (                                                                           +
         id,                                                                                          +
         phone,                                                                                       +
         name,                                                                                        +
         nickname,                                                                                    +
         auth_user_id,                                                                                +
         verified,                                                                                    +
         created_at,                                                                                  +
         updated_at                                                                                   +
       ) VALUES (                                                                                     +
         v_person_id,                                                                                 +
         '+1' || v_normalized_phone,                                                                  +
         v_person_name,                                                                               +
         v_person_name,                                                                               +
         NEW.id,                                                                                      +
         true,                                                                                        +
         NOW(),                                                                                       +
         NOW()                                                                                        +
       );                                                                                             +
     END IF;                                                                                          +
                                                                                                      +
     -- Update auth metadata for direct OTP users                                                     +
     UPDATE auth.users                                                                                +
     SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(        +
       'person_id', v_person_id,                                                                      +
       'person_name', v_person_name                                                                   +
     )                                                                                                +
     WHERE id = NEW.id;                                                                               +
   END IF;                                                                                            +
                                                                                                      +
   RETURN NEW;                                                                                        +
 END;                                                                                                 +
 $function$                                                                                           +
 
(1 row)

