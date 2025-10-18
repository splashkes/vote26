                           pg_get_functiondef                            
-------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_events_by_week()        +
  RETURNS jsonb                                                         +
  LANGUAGE plpgsql                                                      +
  STABLE SECURITY DEFINER                                               +
 AS $function$                                                          +
 DECLARE                                                                +
   week1_count INTEGER;                                                 +
   week2_count INTEGER;                                                 +
   week3_count INTEGER;                                                 +
   week4_count INTEGER;                                                 +
   result JSONB;                                                        +
 BEGIN                                                                  +
   -- Week 1: 0-7 days                                                  +
   SELECT COUNT(*)                                                      +
   INTO week1_count                                                     +
   FROM events                                                          +
   WHERE event_start_datetime >= NOW()                                  +
     AND event_start_datetime < NOW() + INTERVAL '7 days'               +
     AND (eid ~ '^AB\d{3,4}$')                                          +
     AND (eid::text NOT SIMILAR TO 'AB(4[0-9]{3}|5[0-9]{3}|6[0-9]{3})');+
                                                                        +
   -- Week 2: 7-14 days                                                 +
   SELECT COUNT(*)                                                      +
   INTO week2_count                                                     +
   FROM events                                                          +
   WHERE event_start_datetime >= NOW() + INTERVAL '7 days'              +
     AND event_start_datetime < NOW() + INTERVAL '14 days'              +
     AND (eid ~ '^AB\d{3,4}$')                                          +
     AND (eid::text NOT SIMILAR TO 'AB(4[0-9]{3}|5[0-9]{3}|6[0-9]{3})');+
                                                                        +
   -- Week 3: 14-21 days                                                +
   SELECT COUNT(*)                                                      +
   INTO week3_count                                                     +
   FROM events                                                          +
   WHERE event_start_datetime >= NOW() + INTERVAL '14 days'             +
     AND event_start_datetime < NOW() + INTERVAL '21 days'              +
     AND (eid ~ '^AB\d{3,4}$')                                          +
     AND (eid::text NOT SIMILAR TO 'AB(4[0-9]{3}|5[0-9]{3}|6[0-9]{3})');+
                                                                        +
   -- Week 4: 21-28 days                                                +
   SELECT COUNT(*)                                                      +
   INTO week4_count                                                     +
   FROM events                                                          +
   WHERE event_start_datetime >= NOW() + INTERVAL '21 days'             +
     AND event_start_datetime < NOW() + INTERVAL '28 days'              +
     AND (eid ~ '^AB\d{3,4}$')                                          +
     AND (eid::text NOT SIMILAR TO 'AB(4[0-9]{3}|5[0-9]{3}|6[0-9]{3})');+
                                                                        +
   result := jsonb_build_object(                                        +
     'week1', week1_count,                                              +
     'week2', week2_count,                                              +
     'week3', week3_count,                                              +
     'week4', week4_count,                                              +
     'metric_type', 'events_by_week'                                    +
   );                                                                   +
                                                                        +
   RETURN result;                                                       +
 END;                                                                   +
 $function$                                                             +
 
(1 row)

