                           pg_get_functiondef                            
-------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_facebook_budget()       +
  RETURNS jsonb                                                         +
  LANGUAGE plpgsql                                                      +
  STABLE SECURITY DEFINER                                               +
 AS $function$                                                          +
 DECLARE                                                                +
   total_budget NUMERIC;                                                +
   event_count INTEGER;                                                 +
   result JSONB;                                                        +
 BEGIN                                                                  +
   SELECT                                                               +
     COALESCE(SUM(meta_ads_budget), 0),                                 +
     COUNT(*)                                                           +
   INTO total_budget, event_count                                       +
   FROM events                                                          +
   WHERE event_start_datetime >= NOW()                                  +
     AND event_start_datetime <= NOW() + INTERVAL '8 weeks'             +
     AND meta_ads_budget IS NOT NULL                                    +
     AND meta_ads_budget > 0                                            +
     AND (eid ~ '^AB\d{3,4}$')                                          +
     AND (eid::text NOT SIMILAR TO 'AB(4[0-9]{3}|5[0-9]{3}|6[0-9]{3})');+
                                                                        +
   result := jsonb_build_object(                                        +
     'total_budget', total_budget,                                      +
     'event_count', event_count,                                        +
     'metric_type', 'facebook_budget'                                   +
   );                                                                   +
                                                                        +
   RETURN result;                                                       +
 END;                                                                   +
 $function$                                                             +
 
(1 row)

