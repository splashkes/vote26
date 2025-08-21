                              pg_get_functiondef                              
------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.generate_all_hourly_summaries()           +
  RETURNS jsonb                                                              +
  LANGUAGE plpgsql                                                           +
 AS $function$                                                               +
 DECLARE                                                                     +
   v_event_id UUID;                                                          +
   v_count INT := 0;                                                         +
 BEGIN                                                                       +
   -- Generate summaries for all active events with Slack channels configured+
   FOR v_event_id IN                                                         +
     SELECT DISTINCT e.id                                                    +
     FROM events e                                                           +
     JOIN event_slack_settings es ON es.event_id = e.id                      +
     WHERE e.enabled = true                                                  +
       AND es.channel_id IS NOT NULL                                         +
       AND e.event_start_datetime <= NOW()                                   +
       AND (e.event_end_datetime IS NULL OR e.event_end_datetime >= NOW())   +
   LOOP                                                                      +
     PERFORM generate_hourly_summary(v_event_id);                            +
     v_count := v_count + 1;                                                 +
   END LOOP;                                                                 +
                                                                             +
   RETURN jsonb_build_object(                                                +
     'events_processed', v_count,                                            +
     'timestamp', NOW()                                                      +
   );                                                                        +
 END;                                                                        +
 $function$                                                                  +
 
(1 row)

