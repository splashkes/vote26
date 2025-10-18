                        pg_get_functiondef                         
-------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_overview_overdue_payments()+
  RETURNS jsonb                                                   +
  LANGUAGE plpgsql                                                +
  STABLE SECURITY DEFINER                                         +
 AS $function$                                                    +
 DECLARE                                                          +
   count_overdue INTEGER;                                         +
   total_owed NUMERIC;                                            +
   result JSONB;                                                  +
 BEGIN                                                            +
   WITH overdue AS (                                              +
     SELECT                                                       +
       artist_id,                                                 +
       balance_owed,                                              +
       currency                                                   +
     FROM get_overdue_artist_payments(14)                         +
   )                                                              +
   SELECT                                                         +
     COUNT(*),                                                    +
     COALESCE(SUM(balance_owed), 0)                               +
   INTO count_overdue, total_owed                                 +
   FROM overdue                                                   +
   WHERE currency = 'CAD';                                        +
                                                                  +
   result := jsonb_build_object(                                  +
     'count', count_overdue,                                      +
     'total_owed', total_owed,                                    +
     'metric_type', 'overdue_payments'                            +
   );                                                             +
                                                                  +
   RETURN result;                                                 +
 END;                                                             +
 $function$                                                       +
 
(1 row)

