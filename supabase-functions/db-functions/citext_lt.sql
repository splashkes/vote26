                     pg_get_functiondef                      
-------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.citext_lt(citext, citext)+
  RETURNS boolean                                           +
  LANGUAGE c                                                +
  IMMUTABLE PARALLEL SAFE STRICT                            +
 AS '$libdir/citext', $function$citext_lt$function$         +
 
(1 row)

