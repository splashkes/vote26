                                                                     pg_get_functiondef                                                                      
-------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_artist_applications_for_feed(days_back integer DEFAULT 7, limit_count integer DEFAULT 25)                            +
  RETURNS TABLE(id uuid, artist_profile_id uuid, event_id uuid, applied_at timestamp with time zone, artist_number text, event_eid text, sample_works jsonb)+
  LANGUAGE plpgsql                                                                                                                                          +
 AS $function$                                                                                                                                              +
  BEGIN                                                                                                                                                     +
      RETURN QUERY                                                                                                                                          +
      SELECT DISTINCT ON (aa.artist_number, aa.event_eid)                                                                                                   +
          aa.id,                                                                                                                                            +
          aa.artist_profile_id,                                                                                                                             +
          aa.event_id,                                                                                                                                      +
          aa.applied_at,                                                                                                                                    +
          aa.artist_number,                                                                                                                                 +
          aa.event_eid,                                                                                                                                     +
          (                                                                                                                                                 +
              SELECT jsonb_agg(                                                                                                                             +
                  jsonb_build_object(                                                                                                                       +
                      'id', sw.id,                                                                                                                          +
                      'title', sw.title,                                                                                                                    +
                      'image_url', sw.image_url,                                                                                                            +
                      'source_type', sw.source_type                                                                                                         +
                  )                                                                                                                                         +
              )                                                                                                                                             +
              FROM get_unified_sample_works(aa.artist_profile_id) sw                                                                                        +
          ) as sample_works                                                                                                                                 +
      FROM artist_applications aa                                                                                                                           +
      WHERE aa.applied_at > (NOW() - (days_back || ' days')::INTERVAL)                                                                                      +
        AND EXISTS (                                                                                                                                        +
            SELECT 1 FROM get_unified_sample_works(aa.artist_profile_id)                                                                                    +
        )                                                                                                                                                   +
        AND NOT EXISTS (                                                                                                                                    +
            SELECT 1                                                                                                                                        +
            FROM artist_confirmations ac                                                                                                                    +
            WHERE ac.artist_number = aa.artist_number                                                                                                       +
              AND ac.event_eid = aa.event_eid                                                                                                               +
              AND ac.confirmation_status = 'confirmed'                                                                                                      +
              AND ac.withdrawn_at IS NULL                                                                                                                   +
        )                                                                                                                                                   +
      ORDER BY aa.artist_number, aa.event_eid, aa.applied_at DESC                                                                                           +
      LIMIT limit_count;                                                                                                                                    +
  END;                                                                                                                                                      +
  $function$                                                                                                                                                +
 
(1 row)

