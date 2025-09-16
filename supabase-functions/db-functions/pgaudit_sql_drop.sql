                     pg_get_functiondef                     
------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.pgaudit_sql_drop()      +
  RETURNS event_trigger                                    +
  LANGUAGE c                                               +
  SECURITY DEFINER                                         +
  SET search_path TO 'pg_catalog, pg_temp'                 +
 AS '$libdir/pgaudit', $function$pgaudit_sql_drop$function$+
 
(1 row)

