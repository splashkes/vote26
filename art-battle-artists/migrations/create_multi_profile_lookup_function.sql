-- Create function for multi-profile lookup
-- This function runs the complex query to find candidate profiles for a phone number

CREATE OR REPLACE FUNCTION multi_profile_lookup(target_phone TEXT)
RETURNS TABLE (
    rank INTEGER,
    source_type TEXT,
    display_name TEXT,
    email TEXT,
    existing_profile_id UUID,
    person_id UUID,
    form_17_entry_id INTEGER,
    final_score NUMERIC,
    description TEXT,
    recommended_action TEXT,
    form_17_metadata JSONB
)
LANGUAGE SQL
SECURITY DEFINER
AS $$

WITH phone_lookup AS (
    -- Find all Form 17 entries and existing profiles for this phone
    SELECT 
        apa.form_17_entry_id,
        apa.final_score,
        apa.form_17_metadata,
        apa.alias_profile_id,
        ap.id as existing_profile_id,
        ap.name as existing_profile_name,
        ap.email as existing_profile_email,
        p.id as person_id,
        p.name as person_name,
        'existing_profile' as source_type,
        1 as priority  -- Existing profiles get highest priority
    FROM artist_profile_aliases apa
    LEFT JOIN artist_profiles ap ON apa.alias_profile_id = ap.id
    LEFT JOIN people p ON ap.primary_for = p.id
    WHERE apa.form_17_phone = target_phone
    AND apa.alias_profile_id IS NOT NULL
    
    UNION ALL
    
    -- Add people records that match this phone
    SELECT
        NULL::INTEGER as form_17_entry_id,
        0::NUMERIC as final_score,
        '{}'::JSONB as form_17_metadata,
        NULL::UUID as alias_profile_id,
        NULL::UUID as existing_profile_id,
        NULL as existing_profile_name,
        NULL as existing_profile_email,
        p.id as person_id,
        p.name as person_name,
        'person_record' as source_type,
        2 as priority  -- People records get medium priority
    FROM people p
    WHERE p.phone = target_phone
    AND p.id NOT IN (
        -- Exclude people already linked to profiles above
        SELECT DISTINCT ap.primary_for 
        FROM artist_profile_aliases apa
        JOIN artist_profiles ap ON apa.alias_profile_id = ap.id
        WHERE apa.form_17_phone = target_phone
        AND ap.primary_for IS NOT NULL
    )
    
    UNION ALL
    
    -- Add top Form 17 candidates that don't have profiles yet
    SELECT 
        apa.form_17_entry_id,
        apa.final_score,
        apa.form_17_metadata,
        apa.alias_profile_id,
        NULL::UUID as existing_profile_id,
        NULL as existing_profile_name,
        NULL as existing_profile_email,
        NULL::UUID as person_id,
        NULL as person_name,
        'form17_candidate' as source_type,
        3 as priority  -- Form 17 candidates get lowest priority
    FROM artist_profile_aliases apa
    WHERE apa.form_17_phone = target_phone
    AND apa.alias_profile_id IS NULL
    AND apa.final_score >= 25  -- Only high-quality candidates
),

ranked_options AS (
    -- Rank all options by priority and score
    SELECT *,
        ROW_NUMBER() OVER (
            ORDER BY 
                priority ASC,  -- Lower priority number = higher actual priority
                final_score DESC,
                form_17_entry_id DESC  -- Newer entries break ties
        ) as rank
    FROM phone_lookup
),

top_options AS (
    -- Get top 3 options
    SELECT * FROM ranked_options WHERE rank <= 3
)

-- Final result with extracted names and details
SELECT 
    rank::INTEGER,
    source_type,
    CASE 
        WHEN source_type = 'existing_profile' THEN existing_profile_name
        WHEN source_type = 'person_record' THEN person_name
        WHEN source_type = 'form17_candidate' THEN 
            COALESCE(
                (form_17_metadata->'extracted_data'->>'first_name') || ' ' || 
                (form_17_metadata->'extracted_data'->>'last_name'),
                (form_17_metadata->'extracted_data'->>'email')
            )
        ELSE 'Unknown'
    END as display_name,
    
    CASE 
        WHEN source_type = 'existing_profile' THEN existing_profile_email
        WHEN source_type = 'form17_candidate' THEN 
            (form_17_metadata->'extracted_data'->>'email')
        ELSE NULL
    END as email,
    
    existing_profile_id,
    person_id,
    form_17_entry_id,
    final_score,
    
    -- Additional context for the UI
    CASE 
        WHEN source_type = 'existing_profile' THEN 'Existing Artist Profile'
        WHEN source_type = 'person_record' THEN 'Person Record'
        WHEN source_type = 'form17_candidate' THEN 'Form 17 Entry (Score: ' || ROUND(final_score, 1) || ')'
        ELSE 'Unknown'
    END as description,
    
    -- Action needed for login system
    CASE 
        WHEN source_type = 'existing_profile' THEN 'use_existing_profile'
        WHEN source_type = 'person_record' THEN 'link_to_person'
        WHEN source_type = 'form17_candidate' THEN 'create_new_profile'
        ELSE 'unknown_action'
    END as recommended_action,
    
    form_17_metadata

FROM top_options
ORDER BY rank;

$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION multi_profile_lookup(TEXT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION multi_profile_lookup(TEXT) IS 'Lookup candidate profiles for a phone number, returning up to 3 ranked options';