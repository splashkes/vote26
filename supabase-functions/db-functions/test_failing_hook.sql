                        pg_get_functiondef                        
------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.test_failing_hook(event jsonb)+
  RETURNS jsonb                                                  +
  LANGUAGE plpgsql                                               +
  SECURITY DEFINER                                               +
 AS $function$                                                   +
 BEGIN                                                           +
     -- Force an error to see failure behavior                   +
     RAISE EXCEPTION 'Deliberate hook failure for testing';      +
     RETURN jsonb_build_object('claims', '{}');                  +
 END;                                                            +
 $function$                                                      +
 
(1 row)

