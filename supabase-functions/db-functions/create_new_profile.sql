                                                                              pg_get_functiondef                                                                              
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.create_new_profile(target_person_id uuid, profile_name text, profile_email text DEFAULT NULL::text, profile_phone text DEFAULT NULL::text)+
  RETURNS TABLE(success boolean, message text, new_profile_id uuid)                                                                                                          +
  LANGUAGE plpgsql                                                                                                                                                           +
 AS $function$                                                                                                                                                               +
 DECLARE                                                                                                                                                                     +
     new_id UUID;                                                                                                                                                            +
 BEGIN                                                                                                                                                                       +
     -- Generate new UUID                                                                                                                                                    +
     new_id := gen_random_uuid();                                                                                                                                            +
                                                                                                                                                                             +
     -- Clear any existing primary profiles for this person (clear timestamps)                                                                                               +
     UPDATE artist_profiles                                                                                                                                                  +
     SET set_primary_profile_at = NULL                                                                                                                                       +
     WHERE person_id = target_person_id                                                                                                                                      +
       AND set_primary_profile_at IS NOT NULL;                                                                                                                               +
                                                                                                                                                                             +
     -- Create new profile                                                                                                                                                   +
     INSERT INTO artist_profiles (                                                                                                                                           +
         id,                                                                                                                                                                 +
         person_id,                                                                                                                                                          +
         name,                                                                                                                                                               +
         email,                                                                                                                                                              +
         phone,                                                                                                                                                              +
         set_primary_profile_at,                                                                                                                                             +
         created_at,                                                                                                                                                         +
         updated_at                                                                                                                                                          +
     ) VALUES (                                                                                                                                                              +
         new_id,                                                                                                                                                             +
         target_person_id,                                                                                                                                                   +
         profile_name,                                                                                                                                                       +
         profile_email,                                                                                                                                                      +
         profile_phone,                                                                                                                                                      +
         NOW(),                                                                                                                                                              +
         NOW(),                                                                                                                                                              +
         NOW()                                                                                                                                                               +
     );                                                                                                                                                                      +
                                                                                                                                                                             +
     RETURN QUERY SELECT TRUE, 'New profile created successfully', new_id;                                                                                                   +
 END;                                                                                                                                                                        +
 $function$                                                                                                                                                                  +
 
(1 row)

