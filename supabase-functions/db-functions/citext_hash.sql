                  pg_get_functiondef                   
-------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.citext_hash(citext)+
  RETURNS integer                                     +
  LANGUAGE c                                          +
  IMMUTABLE PARALLEL SAFE STRICT                      +
 AS '$libdir/citext', $function$citext_hash$function$ +
 
(1 row)

