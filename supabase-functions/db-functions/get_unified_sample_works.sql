                                                                             pg_get_functiondef                                                                             
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_unified_sample_works(profile_id uuid)                                                                                               +
  RETURNS TABLE(id uuid, title text, description text, image_url text, source_type text, display_order integer, cloudflare_id text, original_url text, compressed_url text)+
  LANGUAGE plpgsql                                                                                                                                                         +
 AS $function$                                                                                                                                                             +
  BEGIN                                                                                                                                                                    +
      RETURN QUERY                                                                                                                                                         +
      WITH                                                                                                                                                                 +
      -- Modern sample works from artist_sample_works + media_files                                                                                                        +
      modern_works AS (                                                                                                                                                    +
          SELECT                                                                                                                                                           +
              asw.id,                                                                                                                                                      +
              asw.title::TEXT,                                                                                                                                             +
              asw.description::TEXT,                                                                                                                                       +
              CASE                                                                                                                                                         +
                  WHEN mf.cloudflare_id IS NOT NULL THEN                                                                                                                   +
                      'https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/' || mf.cloudflare_id || '/public'                                                                 +
                  ELSE                                                                                                                                                     +
                      COALESCE(mf.compressed_url, mf.original_url)                                                                                                         +
              END::TEXT as image_url,                                                                                                                                      +
              'modern'::TEXT as source_type,                                                                                                                               +
              COALESCE(asw.display_order, 0) as display_order,                                                                                                             +
              mf.cloudflare_id::TEXT,                                                                                                                                      +
              mf.original_url::TEXT,                                                                                                                                       +
              mf.compressed_url::TEXT                                                                                                                                      +
          FROM artist_sample_works asw                                                                                                                                     +
          LEFT JOIN media_files mf ON asw.media_file_id = mf.id                                                                                                            +
          WHERE asw.artist_profile_id = profile_id                                                                                                                         +
      ),                                                                                                                                                                   +
                                                                                                                                                                           +
      -- Legacy sample works from sample_works_urls array                                                                                                                  +
      legacy_works AS (                                                                                                                                                    +
          SELECT                                                                                                                                                           +
              gen_random_uuid() as id,                                                                                                                                     +
              'Legacy Sample Work'::TEXT as title,                                                                                                                         +
              NULL::TEXT as description,                                                                                                                                   +
              url::TEXT as image_url,                                                                                                                                      +
              'legacy'::TEXT as source_type,                                                                                                                               +
              (1000 + row_number() OVER())::INTEGER as display_order, -- Put legacy works after modern ones                                                                +
              NULL::TEXT as cloudflare_id,                                                                                                                                 +
              url::TEXT as original_url,                                                                                                                                   +
              NULL::TEXT as compressed_url                                                                                                                                 +
          FROM artist_profiles ap                                                                                                                                          +
          CROSS JOIN LATERAL unnest(COALESCE(ap.sample_works_urls, ARRAY[]::TEXT[])) WITH ORDINALITY AS t(url, ord)                                                        +
          WHERE ap.id = profile_id                                                                                                                                         +
            AND ap.sample_works_urls IS NOT NULL                                                                                                                           +
            AND array_length(ap.sample_works_urls, 1) > 0                                                                                                                  +
      )                                                                                                                                                                    +
                                                                                                                                                                           +
      -- Combine modern and legacy works, ordered by display_order                                                                                                         +
      SELECT * FROM modern_works                                                                                                                                           +
      UNION ALL                                                                                                                                                            +
      SELECT * FROM legacy_works                                                                                                                                           +
      ORDER BY display_order ASC, source_type DESC; -- Modern first, then legacy                                                                                           +
  END;                                                                                                                                                                     +
  $function$                                                                                                                                                               +
 
(1 row)

