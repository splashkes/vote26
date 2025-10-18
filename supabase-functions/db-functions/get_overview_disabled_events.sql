                           pg_get_functiondef                            
-------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_disabled_events()       +
  RETURNS jsonb                                                         +
  LANGUAGE plpgsql                                                      +
  STABLE SECURITY DEFINER                                               +
 AS $function$                                                          +
 DECLARE                                                                +
   count_disabled INTEGER;                                              +
   result JSONB;                                                        +
 BEGIN                                                                  +
   SELECT COUNT(*)                                                      +
   INTO count_disabled                                                  +
   FROM events                                                          +
   WHERE enabled = false                                                +
     AND (eid ~ '^AB\d{3,4}$')                                          +
     AND (eid::text NOT SIMILAR TO 'AB(4[0-9]{3}|5[0-9]{3}|6[0-9]{3})');+
                                                                        +
   result := jsonb_build_object(                                        +
     'count', count_disabled,                                           +
     'metric_type', 'disabled_events'                                   +
   );                                                                   +
                                                                        +
   RETURN result;                                                       +
 END;                                                                   +
 $function$                                                             +
 
(1 row)

