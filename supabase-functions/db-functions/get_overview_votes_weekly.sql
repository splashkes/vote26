                                                            pg_get_functiondef                                                            
------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_votes_weekly()                                                                           +
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
       COUNT(v.id) as vote_count                                                                                                         +
     FROM week_series ws                                                                                                                 +
     LEFT JOIN votes v ON                                                                                                                +
       v.created_at >= (NOW() - (ws.weeks_ago + 1) * INTERVAL '1 week')                                                                  +
       AND v.created_at < (NOW() - ws.weeks_ago * INTERVAL '1 week')                                                                     +
     GROUP BY ws.weeks_ago                                                                                                               +
     ORDER BY ws.weeks_ago DESC                                                                                                          +
   )                                                                                                                                     +
   SELECT                                                                                                                                +
     jsonb_agg(                                                                                                                          +
       jsonb_build_object(                                                                                                               +
         'week_offset', weeks_ago,                                                                                                       +
         'count', vote_count,                                                                                                            +
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
   FROM votes                                                                                                                            +
   WHERE created_at >= NOW() - INTERVAL '1 week';                                                                                        +
                                                                                                                                         +
   SELECT COUNT(*) INTO last_week                                                                                                        +
   FROM votes                                                                                                                            +
   WHERE created_at >= NOW() - INTERVAL '2 weeks'                                                                                        +
     AND created_at < NOW() - INTERVAL '1 week';                                                                                         +
                                                                                                                                         +
   result := jsonb_build_object(                                                                                                         +
     'metric_type', 'votes_weekly',                                                                                                      +
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

