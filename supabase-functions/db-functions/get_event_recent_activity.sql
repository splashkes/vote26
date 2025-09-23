                                                                            pg_get_functiondef                                                                            
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_recent_activity(p_event_id uuid)                                                                                            +
  RETURNS TABLE(last_10_minutes_qr bigint, last_10_minutes_votes bigint, last_10_minutes_bids bigint, last_hour_qr bigint, last_hour_votes bigint, last_hour_bids bigint)+
  LANGUAGE plpgsql                                                                                                                                                       +
 AS $function$                                                                                                                                                           +
 BEGIN                                                                                                                                                                   +
     RETURN QUERY                                                                                                                                                        +
     SELECT                                                                                                                                                              +
         -- Last 10 minutes                                                                                                                                              +
         (SELECT COUNT(*) FROM people_qr_scans WHERE event_id = p_event_id AND created_at >= NOW() - INTERVAL '10 minutes')::bigint,                                     +
         (SELECT COUNT(*) FROM votes WHERE event_id = p_event_id AND created_at >= NOW() - INTERVAL '10 minutes')::bigint,                                               +
         (SELECT COUNT(*) FROM bids b JOIN art a ON b.art_id = a.id WHERE a.event_id = p_event_id AND b.created_at >= NOW() - INTERVAL '10 minutes')::bigint,            +
         -- Last hour                                                                                                                                                    +
         (SELECT COUNT(*) FROM people_qr_scans WHERE event_id = p_event_id AND created_at >= NOW() - INTERVAL '1 hour')::bigint,                                         +
         (SELECT COUNT(*) FROM votes WHERE event_id = p_event_id AND created_at >= NOW() - INTERVAL '1 hour')::bigint,                                                   +
         (SELECT COUNT(*) FROM bids b JOIN art a ON b.art_id = a.id WHERE a.event_id = p_event_id AND b.created_at >= NOW() - INTERVAL '1 hour')::bigint;                +
 END;                                                                                                                                                                    +
 $function$                                                                                                                                                              +
 
(1 row)

