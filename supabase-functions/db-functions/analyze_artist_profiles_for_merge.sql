                                                                  pg_get_functiondef                                                                   
-------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.analyze_artist_profiles_for_merge(profile_ids uuid[])                                                              +
  RETURNS jsonb                                                                                                                                       +
  LANGUAGE plpgsql                                                                                                                                    +
  SECURITY DEFINER                                                                                                                                    +
  SET search_path TO 'public'                                                                                                                         +
 AS $function$                                                                                                                                        +
 DECLARE                                                                                                                                              +
     profile_id uuid;                                                                                                                                 +
     analysis jsonb := '{}'::jsonb;                                                                                                                   +
     profile_info record;                                                                                                                             +
     table_counts jsonb;                                                                                                                              +
 BEGIN                                                                                                                                                +
     FOREACH profile_id IN ARRAY profile_ids                                                                                                          +
     LOOP                                                                                                                                             +
         -- Get profile basic info                                                                                                                    +
         SELECT ap.*, p.email as person_email, p.phone as person_phone, p.auth_user_id, p.name as person_name, p.superseded_by as person_superseded_by+
         INTO profile_info                                                                                                                            +
         FROM artist_profiles ap                                                                                                                      +
         LEFT JOIN people p ON ap.person_id = p.id                                                                                                    +
         WHERE ap.id = profile_id;                                                                                                                    +
                                                                                                                                                      +
         -- Count records in each related table                                                                                                       +
         table_counts := jsonb_build_object(                                                                                                          +
             'artist_applications', (SELECT COUNT(*) FROM artist_applications WHERE artist_profile_id = profile_id),                                  +
             'artist_confirmations', (SELECT COUNT(*) FROM artist_confirmations WHERE artist_profile_id = profile_id),                                +
             'artist_invitations', (SELECT COUNT(*) FROM artist_invitations WHERE artist_profile_id = profile_id),                                    +
             'art', (SELECT COUNT(*) FROM art WHERE artist_id = profile_id),                                                                          +
             'round_contestants', (SELECT COUNT(*) FROM round_contestants WHERE artist_id = profile_id),                                              +
             'votes', (SELECT COUNT(*) FROM votes WHERE artist_profile_id = profile_id),                                                              +
             'artist_payments', (SELECT COUNT(*) FROM artist_payments WHERE artist_profile_id = profile_id),                                          +
             'artist_global_payments', (SELECT COUNT(*) FROM artist_global_payments WHERE artist_profile_id = profile_id)                             +
         );                                                                                                                                           +
                                                                                                                                                      +
         analysis := jsonb_set(                                                                                                                       +
             analysis,                                                                                                                                +
             ARRAY[profile_id::text],                                                                                                                 +
             jsonb_build_object(                                                                                                                      +
                 'profile', jsonb_build_object(                                                                                                       +
                     'id', profile_info.id,                                                                                                           +
                     'name', profile_info.name,                                                                                                       +
                     'email', profile_info.email,                                                                                                     +
                     'phone', profile_info.phone,                                                                                                     +
                     'person_id', profile_info.person_id,                                                                                             +
                     'created_at', profile_info.created_at,                                                                                           +
                     'superseded_by', profile_info.superseded_by                                                                                      +
                 ),                                                                                                                                   +
                 'person', jsonb_build_object(                                                                                                        +
                     'name', profile_info.person_name,                                                                                                +
                     'email', profile_info.person_email,                                                                                              +
                     'phone', profile_info.person_phone,                                                                                              +
                     'auth_user_id', profile_info.auth_user_id,                                                                                       +
                     'superseded_by', profile_info.person_superseded_by                                                                               +
                 ),                                                                                                                                   +
                 'table_counts', table_counts                                                                                                         +
             )                                                                                                                                        +
         );                                                                                                                                           +
     END LOOP;                                                                                                                                        +
                                                                                                                                                      +
     RETURN analysis;                                                                                                                                 +
 END;                                                                                                                                                 +
 $function$                                                                                                                                           +
 
(1 row)

