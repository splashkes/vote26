-- Create unified sample works function with correct types
-- Run with: PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/create_unified_sample_works_function_fixed.sql

CREATE OR REPLACE FUNCTION get_unified_sample_works(profile_id UUID)
RETURNS TABLE (
    id UUID,
    title VARCHAR,
    description VARCHAR,
    image_url VARCHAR,
    source_type VARCHAR,
    display_order INTEGER,
    cloudflare_id VARCHAR,
    original_url VARCHAR,
    compressed_url VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    WITH 
    -- Modern sample works from artist_sample_works + media_files
    modern_works AS (
        SELECT 
            asw.id,
            asw.title,
            asw.description,
            COALESCE(mf.compressed_url, mf.original_url, 
                     'https://imagedelivery.net/oX4qSt5MlodBH5q3baMEMQ/' || mf.cloudflare_id || '/compressed') as image_url,
            'modern'::VARCHAR as source_type,
            COALESCE(asw.display_order, 0) as display_order,
            mf.cloudflare_id,
            mf.original_url,
            mf.compressed_url
        FROM artist_sample_works asw
        LEFT JOIN media_files mf ON asw.media_file_id = mf.id
        WHERE asw.artist_profile_id = profile_id
    ),
    
    -- Legacy sample works from sample_works_urls array
    legacy_works AS (
        SELECT 
            gen_random_uuid() as id,
            'Legacy Sample Work'::VARCHAR as title,
            NULL::VARCHAR as description,
            url::VARCHAR as image_url,
            'legacy'::VARCHAR as source_type,
            (1000 + row_number() OVER())::INTEGER as display_order, -- Put legacy works after modern ones
            NULL::VARCHAR as cloudflare_id,
            url::VARCHAR as original_url,
            NULL::VARCHAR as compressed_url
        FROM artist_profiles ap
        CROSS JOIN LATERAL unnest(COALESCE(ap.sample_works_urls, ARRAY[]::TEXT[])) WITH ORDINALITY AS t(url, ord)
        WHERE ap.id = profile_id
          AND ap.sample_works_urls IS NOT NULL
          AND array_length(ap.sample_works_urls, 1) > 0
    )
    
    -- Combine modern and legacy works, ordered by display_order
    SELECT * FROM modern_works
    UNION ALL
    SELECT * FROM legacy_works
    ORDER BY display_order ASC, source_type DESC; -- Modern first, then legacy
END;
$$ LANGUAGE plpgsql;

-- Test the function
SELECT 'Unified sample works function created successfully' AS status;