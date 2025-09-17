                                  pg_get_functiondef                                  
--------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.ensure_single_featured_work()                     +
  RETURNS trigger                                                                    +
  LANGUAGE plpgsql                                                                   +
 AS $function$                                                                       +
  BEGIN                                                                              +
      -- If this work is being set as featured, unfeatured all others for this artist+
      IF NEW.is_featured = true THEN                                                 +
          UPDATE artist_sample_works                                                 +
          SET is_featured = false                                                    +
          WHERE artist_profile_id = NEW.artist_profile_id                            +
          AND id != COALESCE(NEW.id, gen_random_uuid());                             +
      END IF;                                                                        +
      RETURN NEW;                                                                    +
  END;                                                                               +
  $function$                                                                         +
 
(1 row)

