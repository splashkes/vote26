                                                            pg_get_functiondef                                                            
------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_artist_confirmations_weekly()                                                            +
  RETURNS jsonb                                                                                                                          +
  LANGUAGE plpgsql                                                                                                                       +
  STABLE SECURITY DEFINER                                                                                                                +
 AS $function$                                                                                                                           +
 DECLARE                                                                                                                                 +
   weekly_data JSONB;                                                                                                                    +
   current_week INTEGER;                                                                                                                 +
   last_week INTEGER;                                                                                                                    +
   result JSONB;                                                                                                                         +
 BEGIN                                                                                                                                   +
   -- Get weekly counts for last 10 weeks                                                                                                +
   WITH week_series AS (                                                                                                                 +
     SELECT                                                                                                                              +
       generate_series(9, 0, -1) as weeks_ago                                                                                            +
   ),                                                                                                                                    +
   weekly_counts AS (                                                                                                                    +
     SELECT                                                                                                                              +
       ws.weeks_ago,                                                                                                                     +
       COUNT(ac.id) as confirmation_count                                                                                                +
     FROM week_series ws                                                                                                                 +
     LEFT JOIN artist_confirmations ac ON                                                                                                +
       ac.confirmation_date >= (NOW() - (ws.weeks_ago + 1) * INTERVAL '1 week')                                                          +
       AND ac.confirmation_date < (NOW() - ws.weeks_ago * INTERVAL '1 week')                                                             +
       AND ac.confirmation_status = 'confirmed'                                                                                          +
       AND ac.withdrawn_at IS NULL                                                                                                       +
     GROUP BY ws.weeks_ago                                                                                                               +
     ORDER BY ws.weeks_ago DESC                                                                                                          +
   )                                                                                                                                     +
   SELECT                                                                                                                                +
     jsonb_agg(                                                                                                                          +
       jsonb_build_object(                                                                                                               +
         'week_offset', weeks_ago,                                                                                                       +
         'count', confirmation_count,                                                                                                    +
         'week_label',                                                                                                                   +
           CASE                                                                                                                          +
             WHEN weeks_ago = 0 THEN 'This Week'                                                                                         +
             WHEN weeks_ago = 1 THEN 'Last Week'                                                                                         +
             ELSE weeks_ago || ' weeks ago'                                                                                              +
           END                                                                                                                           +
       ) ORDER BY weeks_ago DESC                                                                                                         +
     )                                                                                                                                   +
   INTO weekly_data                                                                                                                      +
   FROM weekly_counts;                                                                                                                   +
                                                                                                                                         +
   -- Get current week and last week for comparison                                                                                      +
   SELECT COUNT(*) INTO current_week                                                                                                     +
   FROM artist_confirmations                                                                                                             +
   WHERE confirmation_date >= NOW() - INTERVAL '1 week'                                                                                  +
     AND confirmation_status = 'confirmed'                                                                                               +
     AND withdrawn_at IS NULL;                                                                                                           +
                                                                                                                                         +
   SELECT COUNT(*) INTO last_week                                                                                                        +
   FROM artist_confirmations                                                                                                             +
   WHERE confirmation_date >= NOW() - INTERVAL '2 weeks'                                                                                 +
     AND confirmation_date < NOW() - INTERVAL '1 week'                                                                                   +
     AND confirmation_status = 'confirmed'                                                                                               +
     AND withdrawn_at IS NULL;                                                                                                           +
                                                                                                                                         +
   result := jsonb_build_object(                                                                                                         +
     'metric_type', 'artist_confirmations_weekly',                                                                                       +
     'current_week', current_week,                                                                                                       +
     'last_week', last_week,                                                                                                             +
     'change', current_week - last_week,                                                                                                 +
     'change_pct', CASE WHEN last_week > 0 THEN ROUND(((current_week - last_week)::NUMERIC / last_week::NUMERIC) * 100, 1) ELSE NULL END,+
     'weekly_data', weekly_data                                                                                                          +
   );                                                                                                                                    +
                                                                                                                                         +
   RETURN result;                                                                                                                        +
 END;                                                                                                                                    +
 $function$                                                                                                                              +
 
(1 row)

