                      pg_get_functiondef                       
---------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.app_update_avg_dwell_time()+
  RETURNS trigger                                             +
  LANGUAGE plpgsql                                            +
 AS $function$                                                +
 BEGIN                                                        +
     -- Update average dwell time for this content            +
     UPDATE app_content_analytics                             +
     SET avg_dwell_time_ms = (                                +
         SELECT AVG(dwell_time_ms)::integer                   +
         FROM app_engagement_events                           +
         WHERE content_id = NEW.content_id                    +
         AND dwell_time_ms IS NOT NULL                        +
         AND dwell_time_ms > 0                                +
     ),                                                       +
     updated_at = NOW()                                       +
     WHERE content_id = NEW.content_id;                       +
                                                              +
     RETURN NEW;                                              +
 END;                                                         +
 $function$                                                   +
 
(1 row)

