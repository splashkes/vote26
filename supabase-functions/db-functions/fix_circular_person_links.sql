                                               pg_get_functiondef                                               
----------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.fix_circular_person_links()                                                 +
  RETURNS TABLE(auth_user_id uuid, fixed_person_id uuid, original_person_id uuid, person_name text)            +
  LANGUAGE plpgsql                                                                                             +
 AS $function$                                                                                                 +
 DECLARE                                                                                                       +
   r RECORD;                                                                                                   +
   metadata_person_id UUID;                                                                                    +
   linked_person_id UUID;                                                                                      +
   metadata_person_name TEXT;                                                                                  +
 BEGIN                                                                                                         +
   -- Find auth users where metadata person_id differs from their linked person_id                             +
   FOR r IN                                                                                                    +
     SELECT                                                                                                    +
       au.id as auth_id,                                                                                       +
       (au.raw_user_meta_data->>'person_id')::uuid as meta_person_id,                                          +
       p.id as current_person_id                                                                               +
     FROM auth.users au                                                                                        +
     JOIN people p ON p.auth_user_id = au.id                                                                   +
     WHERE (au.raw_user_meta_data->>'person_id')::uuid IS NOT NULL                                             +
     AND (au.raw_user_meta_data->>'person_id')::uuid != p.id                                                   +
   LOOP                                                                                                        +
     metadata_person_id := r.meta_person_id;                                                                   +
     linked_person_id := r.current_person_id;                                                                  +
                                                                                                               +
     -- Get the metadata person's name                                                                         +
     SELECT name INTO metadata_person_name FROM people WHERE id = metadata_person_id;                          +
                                                                                                               +
     -- Verify the metadata person has actual data (not empty)                                                 +
     IF metadata_person_name IS NOT NULL AND metadata_person_name != '' AND metadata_person_name != 'User' THEN+
       -- Unlink current person record                                                                         +
       UPDATE people SET auth_user_id = NULL WHERE id = linked_person_id;                                      +
                                                                                                               +
       -- Link to the metadata person record                                                                   +
       UPDATE people SET auth_user_id = r.auth_id, updated_at = NOW() WHERE id = metadata_person_id;           +
                                                                                                               +
       -- Return the fix info                                                                                  +
       auth_user_id := r.auth_id;                                                                              +
       fixed_person_id := metadata_person_id;                                                                  +
       original_person_id := linked_person_id;                                                                 +
       person_name := metadata_person_name;                                                                    +
       RETURN NEXT;                                                                                            +
     END IF;                                                                                                   +
   END LOOP;                                                                                                   +
                                                                                                               +
   RETURN;                                                                                                     +
 END;                                                                                                          +
 $function$                                                                                                    +
 
(1 row)

