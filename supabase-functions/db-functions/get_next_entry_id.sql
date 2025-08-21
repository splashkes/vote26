                               pg_get_functiondef                               
--------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_next_entry_id()                         +
  RETURNS integer                                                              +
  LANGUAGE plpgsql                                                             +
 AS $function$                                                                 +
 DECLARE                                                                       +
     next_id INTEGER := 310000;                                                +
 BEGIN                                                                         +
     -- Loop until we find an available entry_id                               +
     WHILE EXISTS (SELECT 1 FROM artist_profiles WHERE entry_id = next_id) LOOP+
         next_id := next_id + 1;                                               +
     END LOOP;                                                                 +
                                                                               +
     RETURN next_id;                                                           +
 END;                                                                          +
 $function$                                                                    +
 
(1 row)

