                                 pg_get_functiondef                                 
------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.exec_sql(sql text)                              +
  RETURNS jsonb                                                                    +
  LANGUAGE plpgsql                                                                 +
  SECURITY DEFINER                                                                 +
 AS $function$                                                                     +
 DECLARE                                                                           +
   result jsonb;                                                                   +
 BEGIN                                                                             +
   -- Execute the dynamic SQL and return result as JSONB                           +
   EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', sql) INTO result;+
   RETURN COALESCE(result, '[]'::jsonb);                                           +
 EXCEPTION                                                                         +
   WHEN OTHERS THEN                                                                +
     RAISE EXCEPTION 'exec_sql error: %', SQLERRM;                                 +
 END;                                                                              +
 $function$                                                                        +
 
(1 row)

