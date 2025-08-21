                     pg_get_functiondef                      
-------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.citext_ne(citext, citext)+
  RETURNS boolean                                           +
  LANGUAGE c                                                +
  IMMUTABLE PARALLEL SAFE STRICT                            +
 AS '$libdir/citext', $function$citext_ne$function$         +
 
(1 row)

