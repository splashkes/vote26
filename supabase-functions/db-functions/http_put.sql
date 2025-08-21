                                                      pg_get_functiondef                                                      
------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.http_put(uri character varying, content character varying, content_type character varying)+
  RETURNS http_response                                                                                                      +
  LANGUAGE sql                                                                                                               +
 AS $function$ SELECT public.http(('PUT', $1, NULL, $3, $2)::public.http_request) $function$                                 +
 
(1 row)

