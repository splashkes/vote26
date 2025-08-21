                      pg_get_functiondef                      
--------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.citext_cmp(citext, citext)+
  RETURNS integer                                            +
  LANGUAGE c                                                 +
  IMMUTABLE PARALLEL SAFE STRICT                             +
 AS '$libdir/citext', $function$citext_cmp$function$         +
 
(1 row)

