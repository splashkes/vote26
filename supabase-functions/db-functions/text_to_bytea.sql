                     pg_get_functiondef                     
------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.text_to_bytea(data text)+
  RETURNS bytea                                            +
  LANGUAGE c                                               +
  IMMUTABLE STRICT                                         +
 AS '$libdir/http', $function$text_to_bytea$function$      +
 
(1 row)

