                                              pg_get_functiondef                                               
---------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.http_get(uri character varying)                                            +
  RETURNS http_response                                                                                       +
  LANGUAGE sql                                                                                                +
 AS $function$ SELECT public.http(('GET', $1, NULL, NULL, NULL)::public.http_request) $function$              +
 
 CREATE OR REPLACE FUNCTION public.http_get(uri character varying, data jsonb)                                +
  RETURNS http_response                                                                                       +
  LANGUAGE sql                                                                                                +
 AS $function$                                                                                                +
         SELECT public.http(('GET', $1 || '?' || public.urlencode($2), NULL, NULL, NULL)::public.http_request)+
     $function$                                                                                               +
 
(2 rows)

