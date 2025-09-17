                         pg_get_functiondef                          
---------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.enforce_sample_works_limit()     +
  RETURNS trigger                                                   +
  LANGUAGE plpgsql                                                  +
 AS $function$                                                      +
  BEGIN                                                             +
      IF (                                                          +
          SELECT COUNT(*)                                           +
          FROM artist_sample_works                                  +
          WHERE artist_profile_id = NEW.artist_profile_id           +
      ) >= 10 THEN                                                  +
          RAISE EXCEPTION 'Artist can have at most 10 sample works';+
      END IF;                                                       +
      RETURN NEW;                                                   +
  END;                                                              +
  $function$                                                        +
 
(1 row)

