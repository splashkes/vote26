                                                            pg_get_functiondef                                                            
------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_bids_weekly()                                                                            +
  RETURNS jsonb                                                                                                                          +
  LANGUAGE plpgsql                                                                                                                       +
  STABLE SECURITY DEFINER                                                                                                                +
 AS $function$                                                                                                                           +
 DECLARE                                                                                                                                 +
   weekly_data JSONB;                                                                                                                    +
   current_week INTEGER;                                                                                                                 +
   last_week INTEGER;                                                                                                                    +
   current_week_amount NUMERIC;                                                                                                          +
   last_week_amount NUMERIC;                                                                                                             +
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
       COUNT(b.id) as bid_count,                                                                                                         +
       COALESCE(SUM(b.amount), 0) as total_amount                                                                                        +
     FROM week_series ws                                                                                                                 +
     LEFT JOIN bids b ON                                                                                                                 +
       b.created_at >= (NOW() - (ws.weeks_ago + 1) * INTERVAL '1 week')                                                                  +
       AND b.created_at < (NOW() - ws.weeks_ago * INTERVAL '1 week')                                                                     +
     GROUP BY ws.weeks_ago                                                                                                               +
     ORDER BY ws.weeks_ago DESC                                                                                                          +
   )                                                                                                                                     +
   SELECT                                                                                                                                +
     jsonb_agg(                                                                                                                          +
       jsonb_build_object(                                                                                                               +
         'week_offset', weeks_ago,                                                                                                       +
         'count', bid_count,                                                                                                             +
         'total_amount', total_amount,                                                                                                   +
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
   SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO current_week, current_week_amount                                                      +
   FROM bids                                                                                                                             +
   WHERE created_at >= NOW() - INTERVAL '1 week';                                                                                        +
                                                                                                                                         +
   SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO last_week, last_week_amount                                                            +
   FROM bids                                                                                                                             +
   WHERE created_at >= NOW() - INTERVAL '2 weeks'                                                                                        +
     AND created_at < NOW() - INTERVAL '1 week';                                                                                         +
                                                                                                                                         +
   result := jsonb_build_object(                                                                                                         +
     'metric_type', 'bids_weekly',                                                                                                       +
     'current_week', current_week,                                                                                                       +
     'last_week', last_week,                                                                                                             +
     'current_week_amount', current_week_amount,                                                                                         +
     'last_week_amount', last_week_amount,                                                                                               +
     'change', current_week - last_week,                                                                                                 +
     'change_pct', CASE WHEN last_week > 0 THEN ROUND(((current_week - last_week)::NUMERIC / last_week::NUMERIC) * 100, 1) ELSE NULL END,+
     'weekly_data', weekly_data                                                                                                          +
   );                                                                                                                                    +
                                                                                                                                         +
   RETURN result;                                                                                                                        +
 END;                                                                                                                                    +
 $function$                                                                                                                              +
 
(1 row)

