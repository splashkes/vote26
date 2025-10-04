                               pg_get_functiondef                               
--------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_primary_artist_profile(p_person_id uuid)+
  RETURNS SETOF artist_profiles                                                +
  LANGUAGE plpgsql                                                             +
  STABLE SECURITY DEFINER                                                      +
 AS $function$                                                                 +
 BEGIN                                                                         +
   RETURN QUERY                                                                +
   SELECT ap.*                                                                 +
   FROM artist_profiles ap                                                     +
   WHERE ap.person_id = p_person_id                                            +
     AND ap.superseded_by IS NULL                                              +
   ORDER BY                                                                    +
     ap.set_primary_profile_at DESC NULLS LAST,                                +
     ap.created_at DESC                                                        +
   LIMIT 1;                                                                    +
 END;                                                                          +
 $function$                                                                    +
 
(1 row)

