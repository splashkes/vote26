                         pg_get_functiondef                          
---------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.citext_pattern_ge(citext, citext)+
  RETURNS boolean                                                   +
  LANGUAGE c                                                        +
  IMMUTABLE PARALLEL SAFE STRICT                                    +
 AS '$libdir/citext', $function$citext_pattern_ge$function$         +
 
(1 row)

