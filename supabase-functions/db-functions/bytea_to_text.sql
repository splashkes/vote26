                     pg_get_functiondef                      
-------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.bytea_to_text(data bytea)+
  RETURNS text                                              +
  LANGUAGE c                                                +
  IMMUTABLE STRICT                                          +
 AS '$libdir/http', $function$bytea_to_text$function$       +
 
(1 row)

