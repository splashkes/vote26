                             pg_get_functiondef                              
-----------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.group_artists_by_city(artists_json jsonb)+
  RETURNS jsonb                                                             +
  LANGUAGE plpgsql                                                          +
  SECURITY DEFINER                                                          +
  SET search_path TO 'public'                                               +
 AS $function$                                                              +
 DECLARE                                                                    +
     result jsonb := '{}'::jsonb;                                           +
     artist jsonb;                                                          +
     city_name text;                                                        +
     city_group jsonb;                                                      +
 BEGIN                                                                      +
     -- Iterate through artists and group by city                           +
     FOR artist IN SELECT jsonb_array_elements(artists_json)                +
     LOOP                                                                   +
         city_name := COALESCE(artist->>'recent_city', 'Unknown City');     +
                                                                            +
         -- Get existing city group or create new one                       +
         city_group := COALESCE(result->city_name, '[]'::jsonb);            +
                                                                            +
         -- Add artist to city group                                        +
         city_group := city_group || jsonb_build_array(artist);             +
                                                                            +
         -- Update result                                                   +
         result := jsonb_set(result, ARRAY[city_name], city_group);         +
     END LOOP;                                                              +
                                                                            +
     RETURN result;                                                         +
 END;                                                                       +
 $function$                                                                 +
 
(1 row)

