                                                       pg_get_functiondef                                                        
---------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.admin_update_artist_promo_image(p_artist_profile_id uuid, p_event_eid text, p_image_url text)+
  RETURNS boolean                                                                                                               +
  LANGUAGE plpgsql                                                                                                              +
  SECURITY DEFINER                                                                                                              +
 AS $function$                                                                                                                  +
 DECLARE                                                                                                                        +
   v_updated_rows INTEGER;                                                                                                      +
 BEGIN                                                                                                                          +
   -- Update the promo image URL in artist_confirmations                                                                        +
   UPDATE artist_confirmations                                                                                                  +
   SET                                                                                                                          +
     promotion_artwork_url = CASE                                                                                               +
       WHEN TRIM(p_image_url) = '' THEN NULL                                                                                    +
       ELSE TRIM(p_image_url)                                                                                                   +
     END,                                                                                                                       +
     updated_at = NOW()                                                                                                         +
   WHERE                                                                                                                        +
     artist_profile_id = p_artist_profile_id                                                                                    +
     AND event_eid = p_event_eid                                                                                                +
     AND confirmation_status = 'confirmed';                                                                                     +
                                                                                                                                +
   GET DIAGNOSTICS v_updated_rows = ROW_COUNT;                                                                                  +
                                                                                                                                +
   IF v_updated_rows = 0 THEN                                                                                                   +
     RAISE EXCEPTION 'Artist confirmation not found or not updated';                                                            +
   END IF;                                                                                                                      +
                                                                                                                                +
   RETURN TRUE;                                                                                                                 +
 END;                                                                                                                           +
 $function$                                                                                                                     +
 
(1 row)

