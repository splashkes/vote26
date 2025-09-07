                                  pg_get_functiondef                                  
--------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.has_primary_profile(target_person_id uuid)        +
  RETURNS TABLE(has_primary boolean, profile_id uuid, profile_name character varying)+
  LANGUAGE plpgsql                                                                   +
 AS $function$                                                                       +
 BEGIN                                                                               +
   RETURN QUERY                                                                      +
   SELECT                                                                            +
     CASE WHEN ap.id IS NOT NULL THEN TRUE ELSE FALSE END as has_primary,            +
     ap.id as profile_id,                                                            +
     ap.name as profile_name                                                         +
   FROM artist_profiles ap                                                           +
   WHERE ap.person_id = target_person_id                                             +
   ORDER BY                                                                          +
     ap.set_primary_profile_at DESC NULLS LAST,  -- Prefer timestamped profiles      +
     ap.updated_at DESC,                         -- Then most recently updated       +
     ap.created_at DESC                          -- Then most recently created       +
   LIMIT 1;                                                                          +
                                                                                     +
   IF NOT FOUND THEN                                                                 +
     RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR;                           +
   END IF;                                                                           +
 END;                                                                                +
 $function$                                                                          +
 
(1 row)

