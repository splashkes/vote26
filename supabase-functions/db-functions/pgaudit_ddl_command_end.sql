                        pg_get_functiondef                         
-------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.pgaudit_ddl_command_end()      +
  RETURNS event_trigger                                           +
  LANGUAGE c                                                      +
  SECURITY DEFINER                                                +
  SET search_path TO 'pg_catalog, pg_temp'                        +
 AS '$libdir/pgaudit', $function$pgaudit_ddl_command_end$function$+
 
(1 row)

