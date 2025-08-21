                                        pg_get_functiondef                                        
--------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.http_head(uri character varying)                              +
  RETURNS http_response                                                                          +
  LANGUAGE sql                                                                                   +
 AS $function$ SELECT public.http(('HEAD', $1, NULL, NULL, NULL)::public.http_request) $function$+
 
(1 row)

