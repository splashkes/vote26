                            pg_get_functiondef                            
--------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_revenue_pipeline()       +
  RETURNS jsonb                                                          +
  LANGUAGE plpgsql                                                       +
  STABLE SECURITY DEFINER                                                +
 AS $function$                                                           +
 DECLARE                                                                 +
   total_revenue NUMERIC;                                                +
   event_count INTEGER;                                                  +
   result JSONB;                                                         +
 BEGIN                                                                   +
   WITH upcoming_eids AS (                                               +
     SELECT eid                                                          +
     FROM events                                                         +
     WHERE event_start_datetime >= NOW()                                 +
       AND event_start_datetime <= NOW() + INTERVAL '30 days'            +
       AND (eid ~ '^AB\d{3,4}$')                                         +
       AND (eid::text NOT SIMILAR TO 'AB(4[0-9]{3}|5[0-9]{3}|6[0-9]{3})')+
   ),                                                                    +
   latest_cache AS (                                                     +
     SELECT DISTINCT ON (eac.eid)                                        +
       eac.eid,                                                          +
       eac.ticket_revenue                                                +
     FROM eventbrite_api_cache eac                                       +
     INNER JOIN upcoming_eids ue ON eac.eid = ue.eid                     +
     ORDER BY eac.eid, eac.fetched_at DESC                               +
   )                                                                     +
   SELECT                                                                +
     COALESCE(SUM(lc.ticket_revenue), 0),                                +
     COUNT(DISTINCT ue.eid)                                              +
   INTO total_revenue, event_count                                       +
   FROM upcoming_eids ue                                                 +
   LEFT JOIN latest_cache lc ON ue.eid = lc.eid;                         +
                                                                         +
   result := jsonb_build_object(                                         +
     'total_revenue', total_revenue,                                     +
     'event_count', event_count,                                         +
     'metric_type', 'revenue_pipeline'                                   +
   );                                                                    +
                                                                         +
   RETURN result;                                                        +
 END;                                                                    +
 $function$                                                              +
 
(1 row)

