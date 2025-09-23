                      pg_get_functiondef                      
--------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_available_currencies()+
  RETURNS TABLE(currency_code character varying)             +
  LANGUAGE plpgsql                                           +
  SECURITY DEFINER                                           +
  SET search_path TO 'public'                                +
 AS $function$                                               +
 BEGIN                                                       +
     RETURN QUERY                                            +
     SELECT DISTINCT e.currency                              +
     FROM events e                                           +
     WHERE e.currency IS NOT NULL                            +
     ORDER BY e.currency;                                    +
 END;                                                        +
 $function$                                                  +
 
(1 row)

