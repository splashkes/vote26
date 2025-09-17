                                                                                        pg_get_functiondef                                                                                         
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.admin_get_bulk_artist_stats()                                                                                                                                  +
  RETURNS TABLE(total_confirmed_artists bigint, artists_with_bio bigint, artists_with_promo_image bigint, artists_missing_both bigint, bio_completion_rate numeric, promo_completion_rate numeric)+
  LANGUAGE plpgsql                                                                                                                                                                                +
  SECURITY DEFINER                                                                                                                                                                                +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                                                                                 +
 AS $function$                                                                                                                                                                                    +
  BEGIN                                                                                                                                                                                           +
    RETURN QUERY                                                                                                                                                                                  +
    SELECT                                                                                                                                                                                        +
      COUNT(*) as total_confirmed_artists,                                                                                                                                                        +
      COUNT(CASE WHEN ap.abhq_bio IS NOT NULL AND TRIM(ap.abhq_bio) != '' THEN 1 END) as artists_with_bio,                                                                                        +
      COUNT(CASE WHEN ac.promotion_artwork_url IS NOT NULL AND TRIM(ac.promotion_artwork_url) != '' THEN 1 END) as artists_with_promo_image,                                                      +
      COUNT(CASE WHEN (ap.abhq_bio IS NULL OR TRIM(ap.abhq_bio) = '') AND (ac.promotion_artwork_url IS NULL OR TRIM(ac.promotion_artwork_url) = '') THEN 1 END) as artists_missing_both,          +
      ROUND(                                                                                                                                                                                      +
        (COUNT(CASE WHEN ap.abhq_bio IS NOT NULL AND TRIM(ap.abhq_bio) != '' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2                                                                 +
      ) as bio_completion_rate,                                                                                                                                                                   +
      ROUND(                                                                                                                                                                                      +
        (COUNT(CASE WHEN ac.promotion_artwork_url IS NOT NULL AND TRIM(ac.promotion_artwork_url) != '' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2                                       +
      ) as promo_completion_rate                                                                                                                                                                  +
    FROM artist_confirmations ac                                                                                                                                                                  +
    JOIN artist_profiles ap ON ac.artist_profile_id = ap.id                                                                                                                                       +
    WHERE                                                                                                                                                                                         +
      ac.confirmation_status = 'confirmed'                                                                                                                                                        +
      AND ac.withdrawn_at IS NULL;                                                                                                                                                                +
  END;                                                                                                                                                                                            +
  $function$                                                                                                                                                                                      +
 
(1 row)

