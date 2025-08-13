-- Simplified profile system migration
-- Run with: PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/simplified_profile_system.sql

-- 1. Add set_primary_profile_at timestamp field
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS set_primary_profile_at TIMESTAMP;

-- 2. Create simplified profile lookup function
CREATE OR REPLACE FUNCTION lookup_profiles_by_contact(target_phone TEXT, target_email TEXT DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    name TEXT,
    email TEXT,
    phone TEXT,
    bio TEXT,
    city TEXT,
    website TEXT,
    instagram TEXT,
    facebook TEXT,
    mongo_id TEXT,
    person_id UUID,
    primary_for UUID,
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
            ap.primary_for,
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
            ap.primary_for,
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

-- 3. Function to set profile as primary
CREATE OR REPLACE FUNCTION set_profile_as_primary(profile_id UUID, person_id UUID)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    updated_profile_id UUID
) AS $$
DECLARE
    profile_exists BOOLEAN;
BEGIN
    -- Check if profile exists
    SELECT EXISTS(SELECT 1 FROM artist_profiles WHERE id = profile_id) INTO profile_exists;
    
    IF NOT profile_exists THEN
        RETURN QUERY SELECT FALSE, 'Profile not found', NULL::UUID;
        RETURN;
    END IF;
    
    -- Clear primary_for from any other profiles for this person
    UPDATE artist_profiles 
    SET primary_for = NULL, 
        set_primary_profile_at = NULL
    WHERE primary_for = person_id;
    
    -- Set this profile as primary
    UPDATE artist_profiles 
    SET primary_for = person_id,
        set_primary_profile_at = NOW(),
        person_id = person_id,
        updated_at = NOW()
    WHERE id = profile_id;
    
    RETURN QUERY SELECT TRUE, 'Profile set as primary successfully', profile_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to create new profile when no matches found
CREATE OR REPLACE FUNCTION create_new_profile(
    person_id UUID,
    profile_name TEXT,
    profile_email TEXT DEFAULT NULL,
    profile_phone TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    new_profile_id UUID
) AS $$
DECLARE
    new_id UUID;
BEGIN
    -- Generate new UUID
    new_id := gen_random_uuid();
    
    -- Clear any existing primary profiles for this person
    UPDATE artist_profiles 
    SET primary_for = NULL, 
        set_primary_profile_at = NULL
    WHERE primary_for = person_id;
    
    -- Create new profile
    INSERT INTO artist_profiles (
        id,
        person_id,
        primary_for,
        name,
        email,
        phone,
        set_primary_profile_at,
        created_at,
        updated_at
    ) VALUES (
        new_id,
        person_id,
        person_id,
        profile_name,
        profile_email,
        profile_phone,
        NOW(),
        NOW(),
        NOW()
    );
    
    RETURN QUERY SELECT TRUE, 'New profile created successfully', new_id;
END;
$$ LANGUAGE plpgsql;

-- Verify functions were created
SELECT 'Simplified profile system created successfully' AS status;