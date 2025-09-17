                                 pg_get_functiondef                                  
-------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.update_content_stats(content_uuid text)          +
  RETURNS void                                                                      +
  LANGUAGE plpgsql                                                                  +
 AS $function$                                                                      +
  DECLARE                                                                           +
      total_views INTEGER := 0;                                                     +
      avg_dwell_ms INTEGER := 0;                                                    +
  BEGIN                                                                             +
      -- Calculate stats from engagement events using both UUID and prefixed formats+
      SELECT                                                                        +
          COUNT(*) as views,                                                        +
          COALESCE(AVG(dwell_time_ms)::INTEGER, 0) as avg_dwell                     +
      INTO total_views, avg_dwell_ms                                                +
      FROM app_engagement_events                                                    +
      WHERE content_id IN (                                                         +
          content_uuid,                                                             +
          'winning-artwork-' || content_uuid,                                       +
          'artwork-winning-artwork-' || content_uuid,                               +
          'event-' || content_uuid,                                                 +
          'artist-' || content_uuid                                                 +
      )                                                                             +
      AND dwell_time_ms IS NOT NULL                                                 +
      AND dwell_time_ms > 0;                                                        +
                                                                                    +
      -- Update the curated content table                                           +
      UPDATE app_curated_content                                                    +
      SET                                                                           +
          cached_total_views = total_views,                                         +
          cached_avg_dwell_time_ms = avg_dwell_ms,                                  +
          stats_last_updated = NOW()                                                +
      WHERE content_id = content_uuid OR content_id LIKE '%' || content_uuid || '%';+
  END;                                                                              +
  $function$                                                                        +
 
(1 row)

