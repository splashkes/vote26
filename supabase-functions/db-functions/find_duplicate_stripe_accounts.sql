                                             pg_get_functiondef                                              
-------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.find_duplicate_stripe_accounts(artist_email text)                        +
  RETURNS jsonb                                                                                             +
  LANGUAGE plpgsql                                                                                          +
  SECURITY DEFINER                                                                                          +
  SET search_path TO 'public'                                                                               +
 AS $function$                                                                                              +
 DECLARE                                                                                                    +
     result jsonb := '[]'::jsonb;                                                                           +
     profile_record record;                                                                                 +
 BEGIN                                                                                                      +
     FOR profile_record IN                                                                                  +
         SELECT                                                                                             +
             ap.id,                                                                                         +
             ap.name,                                                                                       +
             ap.email,                                                                                      +
             ap.entry_id,                                                                                   +
             ap.created_at,                                                                                 +
             ap.set_primary_profile_at,                                                                     +
             agp.stripe_recipient_id,                                                                       +
             agp.status as stripe_status,                                                                   +
             agp.created_at as stripe_created_at,                                                           +
             -- Count related data                                                                          +
             (SELECT COUNT(*) FROM art WHERE artist_id = ap.id) as art_count,                               +
             (SELECT COUNT(*) FROM round_contestants WHERE artist_id = ap.id) as event_count,               +
             (SELECT COUNT(*) FROM artist_applications WHERE artist_profile_id = ap.id) as application_count+
         FROM artist_profiles ap                                                                            +
         LEFT JOIN artist_global_payments agp ON ap.id = agp.artist_profile_id                              +
         WHERE ap.email = artist_email                                                                      +
         ORDER BY ap.created_at                                                                             +
     LOOP                                                                                                   +
         result := result || jsonb_build_object(                                                            +
             'profile_id', profile_record.id,                                                               +
             'name', profile_record.name,                                                                   +
             'entry_id', profile_record.entry_id,                                                           +
             'created_at', profile_record.created_at,                                                       +
             'set_primary_profile_at', profile_record.set_primary_profile_at,                               +
             'stripe_recipient_id', profile_record.stripe_recipient_id,                                     +
             'stripe_status', profile_record.stripe_status,                                                 +
             'stripe_created_at', profile_record.stripe_created_at,                                         +
             'data_counts', jsonb_build_object(                                                             +
                 'art', profile_record.art_count,                                                           +
                 'events', profile_record.event_count,                                                      +
                 'applications', profile_record.application_count                                           +
             )                                                                                              +
         );                                                                                                 +
     END LOOP;                                                                                              +
                                                                                                            +
     RETURN result;                                                                                         +
 END;                                                                                                       +
 $function$                                                                                                 +
 
(1 row)

