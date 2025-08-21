                      pg_get_functiondef                      
--------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.http(request http_request)+
  RETURNS http_response                                      +
  LANGUAGE c                                                 +
 AS '$libdir/http', $function$http_request$function$         +
 
(1 row)

