                          pg_get_functiondef                          
----------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.citext_pattern_cmp(citext, citext)+
  RETURNS integer                                                    +
  LANGUAGE c                                                         +
  IMMUTABLE PARALLEL SAFE STRICT                                     +
 AS '$libdir/citext', $function$citext_pattern_cmp$function$         +
 
(1 row)

