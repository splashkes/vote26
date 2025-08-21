                                pg_get_functiondef                                
----------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.mask_name(p_name text)                        +
  RETURNS text                                                                   +
  LANGUAGE plpgsql                                                               +
  IMMUTABLE                                                                      +
 AS $function$                                                                   +
 BEGIN                                                                           +
   IF p_name IS NULL OR length(p_name) < 2 THEN                                  +
     RETURN p_name;                                                              +
   END IF;                                                                       +
                                                                                 +
   RETURN left(p_name, 1) || repeat('*', length(p_name) - 2) || right(p_name, 1);+
 END;                                                                            +
 $function$                                                                      +
 
(1 row)

