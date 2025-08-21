                     pg_get_functiondef                      
-------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.citext_le(citext, citext)+
  RETURNS boolean                                           +
  LANGUAGE c                                                +
  IMMUTABLE PARALLEL SAFE STRICT                            +
 AS '$libdir/citext', $function$citext_le$function$         +
 
(1 row)

