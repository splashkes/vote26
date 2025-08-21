                    pg_get_functiondef                    
----------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.http_list_curlopt()   +
  RETURNS TABLE(curlopt text, value text)                +
  LANGUAGE c                                             +
 AS '$libdir/http', $function$http_list_curlopt$function$+
 
(1 row)

