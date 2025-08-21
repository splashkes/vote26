                                pg_get_functiondef                                 
-----------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_auction_timer_status(p_event_id uuid)      +
  RETURNS jsonb                                                                   +
  LANGUAGE plpgsql                                                                +
  STABLE                                                                          +
  SET search_path TO 'pg_catalog', 'public'                                       +
 AS $function$                                                                    +
 DECLARE                                                                          +
   v_result JSONB;                                                                +
   v_earliest_closing TIMESTAMP WITH TIME ZONE;                                   +
   v_latest_closing TIMESTAMP WITH TIME ZONE;                                     +
   v_active_count INT;                                                            +
   v_with_timers INT;                                                             +
 BEGIN                                                                            +
   -- Get timer statistics                                                        +
   SELECT                                                                         +
     MIN(closing_time) FILTER (WHERE closing_time > NOW()),                       +
     MAX(closing_time) FILTER (WHERE closing_time > NOW()),                       +
     COUNT(*) FILTER (WHERE status = 'active'),                                   +
     COUNT(*) FILTER (WHERE closing_time IS NOT NULL AND closing_time > NOW())    +
   INTO                                                                           +
     v_earliest_closing,                                                          +
     v_latest_closing,                                                            +
     v_active_count,                                                              +
     v_with_timers                                                                +
   FROM art                                                                       +
   WHERE event_id = p_event_id;                                                   +
                                                                                  +
   -- Build result                                                                +
   v_result := jsonb_build_object(                                                +
     'active_artworks', v_active_count,                                           +
     'artworks_with_timers', v_with_timers,                                       +
     'earliest_closing', v_earliest_closing,                                      +
     'latest_closing', v_latest_closing,                                          +
     'timer_active', v_with_timers > 0                                            +
   );                                                                             +
                                                                                  +
   -- Add artwork details if there are timers                                     +
   IF v_with_timers > 0 THEN                                                      +
     v_result := v_result || jsonb_build_object(                                  +
       'artworks', (                                                              +
         SELECT jsonb_agg(                                                        +
           jsonb_build_object(                                                    +
             'art_code', art_code,                                                +
             'closing_time', closing_time,                                        +
             'time_remaining_seconds', EXTRACT(EPOCH FROM (closing_time - NOW())),+
             'extended', auction_extended,                                        +
             'extension_count', extension_count,                                  +
             'current_bid', current_bid,                                          +
             'bid_count', bid_count                                               +
           ) ORDER BY closing_time                                                +
         )                                                                        +
         FROM art                                                                 +
         WHERE event_id = p_event_id                                              +
         AND closing_time IS NOT NULL                                             +
         AND closing_time > NOW()                                                 +
         AND status = 'active'                                                    +
       )                                                                          +
     );                                                                           +
   END IF;                                                                        +
                                                                                  +
   RETURN v_result;                                                               +
 END;                                                                             +
 $function$                                                                       +
 
(1 row)

