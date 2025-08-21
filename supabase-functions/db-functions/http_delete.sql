                                                       pg_get_functiondef                                                        
---------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.http_delete(uri character varying)                                                           +
  RETURNS http_response                                                                                                         +
  LANGUAGE sql                                                                                                                  +
 AS $function$ SELECT public.http(('DELETE', $1, NULL, NULL, NULL)::public.http_request) $function$                             +
 
 CREATE OR REPLACE FUNCTION public.http_delete(uri character varying, content character varying, content_type character varying)+
  RETURNS http_response                                                                                                         +
  LANGUAGE sql                                                                                                                  +
 AS $function$ SELECT public.http(('DELETE', $1, NULL, $3, $2)::public.http_request) $function$                                 +
 
(2 rows)

