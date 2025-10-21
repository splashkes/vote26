                                                                                          pg_get_functiondef                                                                                          
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_auction_timer_status_by_round(p_event_id uuid)                                                                                                                +
  RETURNS TABLE(round_number integer, artworks_total bigint, artworks_with_timers bigint, artworks_active bigint, earliest_closing timestamp with time zone, latest_closing timestamp with time zone)+
  LANGUAGE plpgsql                                                                                                                                                                                   +
  SECURITY DEFINER                                                                                                                                                                                   +
 AS $function$                                                                                                                                                                                       +
 BEGIN                                                                                                                                                                                               +
     RETURN QUERY                                                                                                                                                                                    +
     SELECT                                                                                                                                                                                          +
         a.round as round_number,                                                                                                                                                                    +
         COUNT(*)::BIGINT as artworks_total,                                                                                                                                                         +
         COUNT(CASE WHEN a.closing_time IS NOT NULL THEN 1 END)::BIGINT as artworks_with_timers,                                                                                                     +
         COUNT(CASE WHEN a.status = 'active' THEN 1 END)::BIGINT as artworks_active,                                                                                                                 +
         MIN(a.closing_time) as earliest_closing,                                                                                                                                                    +
         MAX(a.closing_time) as latest_closing                                                                                                                                                       +
     FROM art a                                                                                                                                                                                      +
     WHERE a.event_id = p_event_id                                                                                                                                                                   +
         AND a.artist_id IS NOT NULL  -- Only count artworks with artists                                                                                                                            +
     GROUP BY a.round                                                                                                                                                                                +
     ORDER BY a.round;                                                                                                                                                                               +
 END;                                                                                                                                                                                                +
 $function$                                                                                                                                                                                          +
 
(1 row)

