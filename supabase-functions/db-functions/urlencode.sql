                          pg_get_functiondef                           
-----------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.urlencode(string bytea)            +
  RETURNS text                                                        +
  LANGUAGE c                                                          +
  IMMUTABLE STRICT                                                    +
 AS '$libdir/http', $function$urlencode$function$                     +
 
 CREATE OR REPLACE FUNCTION public.urlencode(string character varying)+
  RETURNS text                                                        +
  LANGUAGE c                                                          +
  IMMUTABLE STRICT                                                    +
 AS '$libdir/http', $function$urlencode$function$                     +
 
 CREATE OR REPLACE FUNCTION public.urlencode(data jsonb)              +
  RETURNS text                                                        +
  LANGUAGE c                                                          +
  IMMUTABLE STRICT                                                    +
 AS '$libdir/http', $function$urlencode_jsonb$function$               +
 
(3 rows)

