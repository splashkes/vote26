                           pg_get_functiondef                           
------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.citext_hash_extended(citext, bigint)+
  RETURNS bigint                                                       +
  LANGUAGE c                                                           +
  IMMUTABLE PARALLEL SAFE STRICT                                       +
 AS '$libdir/citext', $function$citext_hash_extended$function$         +
 
(1 row)

