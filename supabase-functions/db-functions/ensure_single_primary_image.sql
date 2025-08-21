                       pg_get_functiondef                        
-----------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.ensure_single_primary_image()+
  RETURNS trigger                                               +
  LANGUAGE plpgsql                                              +
 AS $function$                                                  +
 BEGIN                                                          +
     IF NEW.is_primary = true THEN                              +
         -- Set all other images for this artwork to non-primary+
         UPDATE art_media                                       +
         SET is_primary = false                                 +
         WHERE art_id = NEW.art_id                              +
           AND id != NEW.id                                     +
           AND is_primary = true;                               +
     END IF;                                                    +
     RETURN NEW;                                                +
 END;                                                           +
 $function$                                                     +
 
(1 row)

