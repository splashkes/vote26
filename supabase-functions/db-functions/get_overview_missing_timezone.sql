                           pg_get_functiondef                            
-------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_missing_timezone()      +
  RETURNS jsonb                                                         +
  LANGUAGE plpgsql                                                      +
  STABLE SECURITY DEFINER                                               +
 AS $function$                                                          +
 DECLARE                                                                +
   count_missing INTEGER;                                               +
   result JSONB;                                                        +
 BEGIN                                                                  +
   SELECT COUNT(*)                                                      +
   INTO count_missing                                                   +
   FROM events                                                          +
   WHERE timezone_id IS NULL                                            +
     AND (eid ~ '^AB\d{3,4}$')                                          +
     AND (eid::text NOT SIMILAR TO 'AB(4[0-9]{3}|5[0-9]{3}|6[0-9]{3})');+
                                                                        +
   result := jsonb_build_object(                                        +
     'count', count_missing,                                            +
     'metric_type', 'missing_timezone'                                  +
   );                                                                   +
                                                                        +
   RETURN result;                                                       +
 END;                                                                   +
 $function$                                                             +
 
(1 row)

