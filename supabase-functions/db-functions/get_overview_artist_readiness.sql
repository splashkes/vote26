                                                pg_get_functiondef                                                 
-------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_artist_readiness()                                                +
  RETURNS jsonb                                                                                                   +
  LANGUAGE plpgsql                                                                                                +
  STABLE SECURITY DEFINER                                                                                         +
 AS $function$                                                                                                    +
 DECLARE                                                                                                          +
   total_count INTEGER;                                                                                           +
   ready_count INTEGER;                                                                                           +
   percentage NUMERIC;                                                                                            +
   result JSONB;                                                                                                  +
 BEGIN                                                                                                            +
   -- Get all upcoming events in next 30 days                                                                     +
   WITH upcoming_events AS (                                                                                      +
     SELECT e.eid                                                                                                 +
     FROM events e                                                                                                +
     WHERE e.event_start_datetime >= NOW()                                                                        +
       AND e.event_start_datetime <= NOW() + INTERVAL '30 days'                                                   +
       AND (e.eid ~ '^AB\d{3,4}$')                                                                                +
       AND (e.eid::text NOT SIMILAR TO 'AB(4[0-9]{3}|5[0-9]{3}|6[0-9]{3})')                                       +
   ),                                                                                                             +
   artist_counts AS (                                                                                             +
     SELECT                                                                                                       +
       ac.event_eid,                                                                                              +
       COUNT(*) FILTER (WHERE ac.confirmation_status = 'confirmed' AND ac.withdrawn_at IS NULL) AS confirmed_count+
     FROM artist_confirmations ac                                                                                 +
     INNER JOIN upcoming_events ue ON ac.event_eid = ue.eid                                                       +
     GROUP BY ac.event_eid                                                                                        +
   )                                                                                                              +
   SELECT                                                                                                         +
     COUNT(*),                                                                                                    +
     COUNT(*) FILTER (WHERE COALESCE(confirmed_count, 0) >= 4)                                                    +
   INTO total_count, ready_count                                                                                  +
   FROM upcoming_events ue                                                                                        +
   LEFT JOIN artist_counts ac ON ue.eid = ac.event_eid;                                                           +
                                                                                                                  +
   IF total_count > 0 THEN                                                                                        +
     percentage := ROUND((ready_count::NUMERIC / total_count::NUMERIC) * 100, 1);                                 +
   ELSE                                                                                                           +
     percentage := 0;                                                                                             +
   END IF;                                                                                                        +
                                                                                                                  +
   result := jsonb_build_object(                                                                                  +
     'total_count', total_count,                                                                                  +
     'ready_count', ready_count,                                                                                  +
     'percentage', percentage,                                                                                    +
     'metric_type', 'artist_readiness'                                                                            +
   );                                                                                                             +
                                                                                                                  +
   RETURN result;                                                                                                 +
 END;                                                                                                             +
 $function$                                                                                                       +
 
(1 row)

