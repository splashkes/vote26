                                           pg_get_functiondef                                           
--------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.http_set_curlopt(curlopt character varying, value character varying)+
  RETURNS boolean                                                                                      +
  LANGUAGE c                                                                                           +
 AS '$libdir/http', $function$http_set_curlopt$function$                                               +
 
(1 row)

