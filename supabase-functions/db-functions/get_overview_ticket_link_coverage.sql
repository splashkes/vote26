                                pg_get_functiondef                                
----------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_ticket_link_coverage()           +
  RETURNS jsonb                                                                  +
  LANGUAGE plpgsql                                                               +
  STABLE SECURITY DEFINER                                                        +
 AS $function$                                                                   +
 DECLARE                                                                         +
   total_events INTEGER;                                                         +
   with_links INTEGER;                                                           +
   percentage NUMERIC;                                                           +
   result JSONB;                                                                 +
 BEGIN                                                                           +
   SELECT                                                                        +
     COUNT(*),                                                                   +
     COUNT(*) FILTER (WHERE ticket_link IS NOT NULL AND ticket_link != '')       +
   INTO total_events, with_links                                                 +
   FROM events                                                                   +
   WHERE event_start_datetime >= NOW()                                           +
     AND event_start_datetime <= NOW() + INTERVAL '60 days'                      +
     AND (eid ~ '^AB\d{3,4}$')                                                   +
     AND (eid::text NOT SIMILAR TO 'AB(4[0-9]{3}|5[0-9]{3}|6[0-9]{3})');         +
                                                                                 +
   IF total_events > 0 THEN                                                      +
     percentage := ROUND((with_links::NUMERIC / total_events::NUMERIC) * 100, 1);+
   ELSE                                                                          +
     percentage := 0;                                                            +
   END IF;                                                                       +
                                                                                 +
   result := jsonb_build_object(                                                 +
     'total_events', total_events,                                               +
     'with_links', with_links,                                                   +
     'percentage', percentage,                                                   +
     'metric_type', 'ticket_coverage'                                            +
   );                                                                            +
                                                                                 +
   RETURN result;                                                                +
 END;                                                                            +
 $function$                                                                      +
 
(1 row)

