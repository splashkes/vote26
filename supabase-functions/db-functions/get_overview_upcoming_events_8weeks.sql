                                       pg_get_functiondef                                       
------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_upcoming_events_8weeks()                       +
  RETURNS jsonb                                                                                +
  LANGUAGE plpgsql                                                                             +
  STABLE SECURITY DEFINER                                                                      +
 AS $function$                                                                                 +
 DECLARE                                                                                       +
   event_count INTEGER;                                                                        +
   result JSONB;                                                                               +
 BEGIN                                                                                         +
   SELECT COUNT(*)                                                                             +
   INTO event_count                                                                            +
   FROM events                                                                                 +
   WHERE event_start_datetime >= NOW()                                                         +
     AND event_start_datetime <= NOW() + INTERVAL '8 weeks'                                    +
     AND (eid ~ '^AB\d{3,4}$')                                                                 +
     AND (eid::text NOT SIMILAR TO 'AB(4[0-9]{3}|5[0-9]{3}|6[0-9]{3})'); -- Exclude test events+
                                                                                               +
   result := jsonb_build_object(                                                               +
     'count', event_count,                                                                     +
     'metric_type', 'upcoming_events'                                                          +
   );                                                                                          +
                                                                                               +
   RETURN result;                                                                              +
 END;                                                                                          +
 $function$                                                                                    +
 
(1 row)

