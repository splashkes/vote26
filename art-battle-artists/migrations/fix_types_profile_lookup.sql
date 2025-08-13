-- Fix types for profile lookup function
-- Run with: PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/fix_types_profile_lookup.sql

-- Profile lookup function with correct column types
CREATE OR REPLACE FUNCTION lookup_profiles_by_contact(target_phone TEXT, target_email TEXT DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    email VARCHAR,
    phone VARCHAR,
    bio TEXT,
    city VARCHAR,
    website TEXT,
    instagram VARCHAR,
    facebook VARCHAR,
    mongo_id VARCHAR,
    person_id UUID,
    set_primary_profile_at TIMESTAMP,
    match_type TEXT,
    score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH normalized_phone AS (
        SELECT CASE 
            WHEN target_phone LIKE '+%' THEN target_phone
            ELSE '+' || target_phone
        END as phone
    ),
    
    -- Phone matches (highest priority)
    phone_matches AS (
        SELECT 
            ap.id,
            ap.name,
            ap.email,
            ap.phone,
            ap.bio,
            ap.city,
            ap.website,
            ap.instagram,
            ap.facebook,
            ap.mongo_id,
            ap.person_id,
            ap.set_primary_profile_at,
            'phone'::TEXT as match_type,
            100 as score
        FROM artist_profiles ap
        CROSS JOIN normalized_phone np
        WHERE ap.phone = np.phone 
           OR ap.phone = REPLACE(np.phone, '+', '')
           OR ('+' || ap.phone) = np.phone
    ),
    
    -- Email matches (if provided and no phone matches)
    email_matches AS (
        SELECT 
            ap.id,
            ap.name,
            ap.email,
            ap.phone,
            ap.bio,
            ap.city,
            ap.website,
            ap.instagram,
            ap.facebook,
            ap.mongo_id,
            ap.person_id,
            ap.set_primary_profile_at,
            'email'::TEXT as match_type,
            80 as score
        FROM artist_profiles ap
        WHERE target_email IS NOT NULL 
          AND ap.email = target_email
          AND NOT EXISTS (SELECT 1 FROM phone_matches)
    )
    
    -- Return phone matches first, then email matches
    SELECT * FROM phone_matches
    UNION ALL
    SELECT * FROM email_matches
    ORDER BY score DESC, name;
END;
$$ LANGUAGE plpgsql;

SELECT 'Profile lookup function recreated with correct types' AS status;