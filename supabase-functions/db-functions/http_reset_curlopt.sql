                    pg_get_functiondef                     
-----------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.http_reset_curlopt()   +
  RETURNS boolean                                         +
  LANGUAGE c                                              +
 AS '$libdir/http', $function$http_reset_curlopt$function$+
 
(1 row)

