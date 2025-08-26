                                   pg_get_functiondef                                    
-----------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.test_city_channel_lookups()                          +
  RETURNS TABLE(city_name text, channel_id text, status text)                           +
  LANGUAGE plpgsql                                                                      +
 AS $function$                                                                          +
 DECLARE                                                                                +
     v_test_cities TEXT[] := ARRAY['toronto', 'montreal', 'nyc', 'vancouver', 'sydney'];+
     v_city TEXT;                                                                       +
     v_result TEXT;                                                                     +
 BEGIN                                                                                  +
     FOREACH v_city IN ARRAY v_test_cities                                              +
     LOOP                                                                               +
         v_result := resolve_slack_channel(v_city);                                     +
                                                                                        +
         IF v_result = 'C0337E73W' THEN                                                 +
             RETURN QUERY SELECT v_city, v_result, 'FALLBACK_TO_GENERAL';               +
         ELSE                                                                           +
             RETURN QUERY SELECT v_city, v_result, 'FOUND';                             +
         END IF;                                                                        +
     END LOOP;                                                                          +
 END;                                                                                   +
 $function$                                                                             +
 
(1 row)

