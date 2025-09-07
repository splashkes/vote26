                                                pg_get_functiondef                                                 
-------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.auto_fix_user_auth_metadata()                                                  +
  RETURNS trigger                                                                                                 +
  LANGUAGE plpgsql                                                                                                +
  SECURITY DEFINER                                                                                                +
 AS $function$                                                                                                    +
 DECLARE                                                                                                          +
     v_person_record RECORD;                                                                                      +
     v_person_hash TEXT;                                                                                          +
 BEGIN                                                                                                            +
     -- Only process INSERT operations on people table where auth_user_id is being linked                         +
     IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.auth_user_id IS NULL AND NEW.auth_user_id IS NOT NULL) THEN +
                                                                                                                  +
         -- Get the person record details                                                                         +
         SELECT id, name, nickname, hash INTO v_person_record                                                     +
         FROM people                                                                                              +
         WHERE id = NEW.id;                                                                                       +
                                                                                                                  +
         -- Generate hash if missing                                                                              +
         IF v_person_record.hash IS NULL THEN                                                                     +
             v_person_hash := encode(sha256((v_person_record.id::text || COALESCE(NEW.phone, ''))::bytea), 'hex');+
                                                                                                                  +
             -- Update the hash in the people record                                                              +
             UPDATE people                                                                                        +
             SET hash = v_person_hash                                                                             +
             WHERE id = NEW.id;                                                                                   +
         ELSE                                                                                                     +
             v_person_hash := v_person_record.hash;                                                               +
         END IF;                                                                                                  +
                                                                                                                  +
         -- Update auth metadata immediately using direct SQL                                                     +
         UPDATE auth.users                                                                                        +
         SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(                +
             'person_id', NEW.id::text,                                                                           +
             'person_hash', v_person_hash,                                                                        +
             'person_name', COALESCE(v_person_record.name, v_person_record.nickname, 'User')                      +
         )                                                                                                        +
         WHERE id = NEW.auth_user_id;                                                                             +
                                                                                                                  +
                                                                                                                  +
         RAISE NOTICE 'Auto-fixed auth metadata for user: % -> person: %', NEW.auth_user_id, NEW.id;              +
     END IF;                                                                                                      +
                                                                                                                  +
     RETURN NEW;                                                                                                  +
 END;                                                                                                             +
 $function$                                                                                                       +
 
(1 row)

