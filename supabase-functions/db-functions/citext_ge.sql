                     pg_get_functiondef                      
-------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.citext_ge(citext, citext)+
  RETURNS boolean                                           +
  LANGUAGE c                                                +
  IMMUTABLE PARALLEL SAFE STRICT                            +
 AS '$libdir/citext', $function$citext_ge$function$         +
 
(1 row)

