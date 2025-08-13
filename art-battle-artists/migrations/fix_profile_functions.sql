-- Fix profile functions to use person_id + set_primary_profile_at approach
-- Run with: PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/fix_profile_functions.sql

-- 1. Updated profile lookup function (no primary_for references)
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

-- 2. Updated function to set profile as primary using timestamp
CREATE OR REPLACE FUNCTION set_profile_as_primary(profile_id UUID, target_person_id UUID)
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
    
    -- Clear set_primary_profile_at from any other profiles with the same person_id
    UPDATE artist_profiles 
    SET set_primary_profile_at = NULL
    WHERE person_id = target_person_id 
      AND set_primary_profile_at IS NOT NULL;
    
    -- Set this profile as primary by setting the timestamp and person_id
    UPDATE artist_profiles 
    SET person_id = target_person_id,
        set_primary_profile_at = NOW(),
        updated_at = NOW()
    WHERE id = profile_id;
    
    RETURN QUERY SELECT TRUE, 'Profile set as primary successfully', profile_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Function to check if user has primary profile set
CREATE OR REPLACE FUNCTION has_primary_profile(target_person_id UUID)
RETURNS TABLE (
    has_primary BOOLEAN,
    profile_id UUID,
    profile_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE WHEN ap.id IS NOT NULL THEN TRUE ELSE FALSE END as has_primary,
        ap.id as profile_id,
        ap.name as profile_name
    FROM artist_profiles ap
    WHERE ap.person_id = target_person_id
      AND ap.set_primary_profile_at IS NOT NULL
    ORDER BY ap.set_primary_profile_at DESC
    LIMIT 1;
    
    -- If no results, return false
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 4. Updated function to create new profile
CREATE OR REPLACE FUNCTION create_new_profile(
    target_person_id UUID,
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
    
    -- Clear any existing primary profiles for this person (clear timestamps)
    UPDATE artist_profiles 
    SET set_primary_profile_at = NULL
    WHERE person_id = target_person_id 
      AND set_primary_profile_at IS NOT NULL;
    
    -- Create new profile
    INSERT INTO artist_profiles (
        id,
        person_id,
        name,
        email,
        phone,
        set_primary_profile_at,
        created_at,
        updated_at
    ) VALUES (
        new_id,
        target_person_id,
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
SELECT 'Profile functions updated successfully' AS status;