                                       pg_get_functiondef                                        
-------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.http_header(field character varying, value character varying)+
  RETURNS http_header                                                                           +
  LANGUAGE sql                                                                                  +
 AS $function$ SELECT $1, $2 $function$                                                         +
 
(1 row)

