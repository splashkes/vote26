                                                                                       pg_get_functiondef                                                                                        
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.emergency_fix_single_user_metadata(user_id uuid, person_id uuid DEFAULT NULL::uuid, person_hash text DEFAULT NULL::text, person_name text DEFAULT NULL::text)+
  RETURNS boolean                                                                                                                                                                               +
  LANGUAGE plpgsql                                                                                                                                                                              +
  SECURITY DEFINER                                                                                                                                                                              +
 AS $function$                                                                                                                                                                                  +
 DECLARE                                                                                                                                                                                        +
     v_person_id UUID;                                                                                                                                                                          +
     v_person_hash TEXT;                                                                                                                                                                        +
     v_person_name TEXT;                                                                                                                                                                        +
 BEGIN                                                                                                                                                                                          +
     -- If person details not provided, look them up                                                                                                                                            +
     IF person_id IS NULL THEN                                                                                                                                                                  +
         SELECT p.id, p.hash, COALESCE(p.name, p.nickname, 'User')                                                                                                                              +
         INTO v_person_id, v_person_hash, v_person_name                                                                                                                                         +
         FROM people p                                                                                                                                                                          +
         WHERE p.auth_user_id = user_id;                                                                                                                                                        +
                                                                                                                                                                                                +
         IF v_person_id IS NULL THEN                                                                                                                                                            +
             RETURN FALSE; -- Can't fix if no person record exists                                                                                                                              +
         END IF;                                                                                                                                                                                +
     ELSE                                                                                                                                                                                       +
         v_person_id := person_id;                                                                                                                                                              +
         v_person_hash := person_hash;                                                                                                                                                          +
         v_person_name := person_name;                                                                                                                                                          +
     END IF;                                                                                                                                                                                    +
                                                                                                                                                                                                +
     -- Generate hash if missing                                                                                                                                                                +
     IF v_person_hash IS NULL THEN                                                                                                                                                              +
         SELECT encode(sha256((v_person_id::text || COALESCE(phone, ''))::bytea), 'hex')                                                                                                        +
         INTO v_person_hash                                                                                                                                                                     +
         FROM people WHERE id = v_person_id;                                                                                                                                                    +
     END IF;                                                                                                                                                                                    +
                                                                                                                                                                                                +
     -- Fix auth metadata (only raw_user_meta_data exists in Supabase)                                                                                                                          +
     UPDATE auth.users                                                                                                                                                                          +
     SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(                                                                                                  +
         'person_id', v_person_id::text,                                                                                                                                                        +
         'person_hash', v_person_hash,                                                                                                                                                          +
         'person_name', v_person_name                                                                                                                                                           +
     )                                                                                                                                                                                          +
     WHERE id = user_id;                                                                                                                                                                        +
                                                                                                                                                                                                +
     RAISE NOTICE 'Emergency fixed auth metadata for user: % -> person: %', user_id, v_person_id;                                                                                               +
                                                                                                                                                                                                +
     RETURN TRUE;                                                                                                                                                                               +
 END;                                                                                                                                                                                           +
 $function$                                                                                                                                                                                     +
 
(1 row)

