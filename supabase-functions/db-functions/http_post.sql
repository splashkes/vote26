                                                       pg_get_functiondef                                                       
--------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.http_post(uri character varying, data jsonb)                                                +
  RETURNS http_response                                                                                                        +
  LANGUAGE sql                                                                                                                 +
 AS $function$                                                                                                                 +
         SELECT public.http(('POST', $1, NULL, 'application/x-www-form-urlencoded', public.urlencode($2))::public.http_request)+
     $function$                                                                                                                +
 
 CREATE OR REPLACE FUNCTION public.http_post(uri character varying, content character varying, content_type character varying) +
  RETURNS http_response                                                                                                        +
  LANGUAGE sql                                                                                                                 +
 AS $function$ SELECT public.http(('POST', $1, NULL, $3, $2)::public.http_request) $function$                                  +
 
(2 rows)

